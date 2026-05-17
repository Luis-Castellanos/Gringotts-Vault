// lib/parser/apple-card.ts
import type {
  ParsedStatement,
  ParsedTransaction,
  ParserContext,
  ParserModule,
  DetectorFn,
  ParserFn,
} from './types';
import { categorize } from './categories';

const PARSER_NAME = 'apple-card';
const PARSER_VERSION = '1.0.0';

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const TRANSFER_KEYWORDS = ['ACH DEPOSIT INTERNET TRANSFER', 'APPLE CASH PAYMENT'];

// ─────────── helpers ───────────

function cleanAmount(s: string): number {
  let str = s.replace(/\$/g, '').replace(/,/g, '').trim();
  if (str.startsWith('(') && str.endsWith(')')) {
    return -parseFloat(str.slice(1, -1));
  }
  return parseFloat(str);
}

function isoDate(mmddyyyy: string): string {
  // Convert 'MM/DD/YYYY' → 'YYYY-MM-DD'
  const [m, d, y] = mmddyyyy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function formatStmtPeriod(
  start: { y: number; m: number; d: number },
  end: { y: number; m: number; d: number },
): string {
  const fmt = (p: { y: number; m: number; d: number }) =>
    `${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}/${p.y}`;
  return `${fmt(start)} - ${fmt(end)}`;
}

function isTransferDescription(description: string): boolean {
  const norm = description.replace(/\s+/g, ' ').trim().toUpperCase();
  return TRANSFER_KEYWORDS.some(kw => norm.includes(kw));
}

// ─────────── detector ───────────

const detect: DetectorFn = (text) => {
  return text.includes('Apple Card') && text.includes('Goldman Sachs Bank USA');
};

// ─────────── period extraction ───────────

function extractPeriod(text: string): {
  start: { y: number; m: number; d: number };
  end: { y: number; m: number; d: number };
  stmtStr: string;
} {
  // Format: 'Feb 4 — Feb 29, 2020' (em-dash) or with hyphen/en-dash variants
  const m = text.match(
    /([A-Z][a-z]{2})\s+(\d{1,2})\s*[—\-–]\s*([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/,
  );
  if (!m) throw new Error('Apple Card: could not find period header');

  const [, sMon, sDay, eMon, eDay, yearStr] = m;
  const year = parseInt(yearStr, 10);
  const sMonth = MONTHS[sMon.toUpperCase()];
  const eMonth = MONTHS[eMon.toUpperCase()];
  if (!sMonth || !eMonth) throw new Error(`Apple Card: unknown month name in '${m[0]}'`);

  // If start month > end month, statement crosses year boundary (e.g. Dec 28 — Jan 4, 2026).
  // Start year is one less than printed year.
  const sYear = sMonth > eMonth ? year - 1 : year;
  const start = { y: sYear, m: sMonth, d: parseInt(sDay, 10) };
  const end = { y: year, m: eMonth, d: parseInt(eDay, 10) };
  return { start, end, stmtStr: formatStmtPeriod(start, end) };
}

// ─────────── account number extraction ───────────

function extractAccountNumber(text: string, filename: string): string {
  const stem = filename.replace(/\.pdf$/i, '');
  const cleanStem = stem.replace(/^\d{8,}_/, '');  // strip upload-system prefix

  // Strategy 1a: underscored convention (`Apple_Card__7999__0201_2020_thru_0229_2020_.pdf`)
  const underscoreMatch = cleanStem.match(/^([A-Za-z_]+?)__(\d{4})__/);
  if (underscoreMatch) return underscoreMatch[2];

  // Strategy 1b: native convention with `#NNNN` (`Apple Card #7999 (1001 2020 thru 1031 2020).pdf`)
  const hashMatch = cleanStem.match(/#(\d{4})\b/);
  if (hashMatch) return hashMatch[1];

  // Strategy 2: PDF text patterns. Apple Card statements show 'ending in NNNN'
  // in the issuer section, but it's not always present. Last 4 might also
  // appear in the customer-care section.
  const textHead = text.slice(0, 8000);
  const last4Match = textHead.match(/(?:ending in|Card Ending IN|Account Number[:\s]+\S*?)(\d{4})\b/i);
  if (last4Match) return last4Match[1];

  throw new Error('Apple Card: could not extract account number from filename or text');
}

// ─────────── main parse loop ───────────

const parse: ParserFn = (text, ctx) => {
  const { stmtStr } = extractPeriod(text);
  const accountNumber = extractAccountNumber(text, ctx.sourceFile);
  const accountId = ctx.accountsByNumber[accountNumber];
  const warnings: string[] = [];

  if (!accountId) {
    throw new Error(
      `Apple Card: account number '${accountNumber}' from PDF not found in ` +
      `accountsByNumber map. Folder '${ctx.folderSlug}' is configured for: ` +
      `[${Object.keys(ctx.accountsByNumber).join(', ')}].`,
    );
  }

  const transactions: ParsedTransaction[] = [];
  let section: 'payments' | 'purchases' | null = null;
  let lastTxnDate: string | null = null;

  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');  // rstrip
    const stripped = line.trim();

    // Section transitions
    if (stripped === 'Payments') { section = 'payments'; continue; }
    if (stripped === 'Transactions') { section = 'purchases'; continue; }
    if (stripped === 'Daily Cash' || stripped === 'Interest Charged' ||
        stripped === 'Legal' || stripped === 'Apple Card Monthly Installments') {
      section = null;
      continue;
    }
    if (section === null) continue;
    if (!stripped || stripped.toLowerCase().startsWith('total ') || stripped.startsWith('Date ')) {
      continue;
    }

    // Daily Cash Adjustment continuation line — applies to the prior transaction.
    if (section === 'purchases' && stripped.startsWith('Daily Cash Adjustment')) {
      const adjAmounts = stripped.match(/\$[\d,]+\.\d{2}/g);
      if (adjAmounts && lastTxnDate !== null) {
        const adjAmt = cleanAmount(adjAmounts[adjAmounts.length - 1]);
        const cat = categorize('Daily Cash Adjustment');
        transactions.push({
          accountId,
          date: lastTxnDate,
          amount: (-Math.abs(adjAmt)).toFixed(2),
          rawDescription: 'Daily Cash Adjustment',
          category: cat.category,
          subcategory: cat.subcategory,
          isTransfer: false,
        });
      }
      continue;
    }

    // Lines that start with MM/DD/YYYY are transactions
    const dateMatch = line.match(/^\s*(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
    if (!dateMatch) continue;
    const [, dateStr, rest] = dateMatch;

    // All dollar amounts on the line. Last one is the transaction amount.
    const amounts = rest.match(/-?\$[\d,]+\.\d{2}/g);
    if (!amounts) continue;
    const amountStr = amounts[amounts.length - 1];
    const amt = cleanAmount(amountStr);

    // Description is everything before the first '  N%  $' token,
    // or before the trailing dollar amount if no percentage column exists.
    let description: string;
    const cutMatch = rest.match(/\s+\d+%\s+\$/);
    if (cutMatch && cutMatch.index !== undefined) {
      description = rest.slice(0, cutMatch.index).trim();
    } else {
      const cutIdx = rest.lastIndexOf(amountStr);
      description = rest.slice(0, cutIdx).trim();
    }

    const isReturn = description.toUpperCase().includes('(RETURN)');

    // Special case: installment-financed item return. The PDF shows a (RETURN)
    // row with a single dollar figure that's actually the cashback claw-back,
    // not the full transaction amount (the $ amount reversal happens in the
    // Installments section). We detect this via: (RETURN) + only one $ figure
    // + adjacent negative percentage.
    const isInstallmentReturnAdjustment =
      isReturn && amounts.length === 1 && /-\d+%\s+\$/.test(rest);

    let signedAmt: number;
    if (section === 'payments') {
      signedAmt = Math.abs(amt);  // payments to card = positive in our schema
    } else if (isInstallmentReturnAdjustment) {
      signedAmt = -Math.abs(amt);  // cashback claw-back = charge = negative
    } else if (isReturn) {
      signedAmt = Math.abs(amt);   // return = credit = positive
    } else {
      signedAmt = -Math.abs(amt);  // purchase = debit = negative
    }

    const date = isoDate(dateStr);
    lastTxnDate = date;

    const cat = categorize(description);
    transactions.push({
      accountId,
      date,
      amount: signedAmt.toFixed(2),
      rawDescription: description,
      category: cat.category,
      subcategory: cat.subcategory,
      isTransfer: isTransferDescription(description),
    });
  }

  if (transactions.length === 0) {
    warnings.push('Apple Card: no transactions parsed — verify PDF text extracted correctly');
  }

  return {
    folderSlug: ctx.folderSlug,
    statementPeriod: stmtStr,
    transactions,
    subAccountsFound: [{ accountNumber, accountName: 'Apple Card' }],
    parserName: PARSER_NAME,
    parserVersion: PARSER_VERSION,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

export const appleCard: ParserModule = {
  parse,
  detect,
  name: PARSER_NAME,
  version: PARSER_VERSION,
};
