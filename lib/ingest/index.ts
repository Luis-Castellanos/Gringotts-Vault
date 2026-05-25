/**
 * Shared ingestion primitives — account resolution, dedup hashing, and the
 * transaction writer. Used by both the offline `scripts/load-master.ts` loader
 * and the in-app upload pipeline (`app/api/documents/upload`).
 *
 * The parser does NOT categorize, so transactions ingested from a parsed
 * statement land as Uncategorized + needs_review and flow into the Review page.
 */

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, imports, paystubs, transactions, vendorRules } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';
import { UNCATEGORIZED_SLUG } from '@/lib/transactions/taxonomy';
import { assetClassForType } from '@/lib/account-types';

// ---------------------------------------------------------------------------
// Account identity
// ---------------------------------------------------------------------------

// Best-effort account type from a name. Returns a taxonomy slug (see
// lib/account-types.ts); the asset class is derived from the slug.
export function inferAccountType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('card') || n.includes('visa') || n.includes('amex') || n.includes('mastercard')) return 'credit_card';
  if (n.includes('savings')) return 'savings';
  if (n.includes('checking')) return 'checking';
  if (n.includes('roth') && n.includes('401')) return 'roth_401k';
  if (n.includes('401')) return '401k';
  if (n.includes('roth')) return 'roth_ira';
  if (n.includes('ira')) return 'traditional_ira';
  if (n.includes('hsa')) return 'hsa';
  if (n.includes('brokerage') || n.includes('vanguard') || n.includes('fidelity') || n.includes('schwab')) return 'brokerage';
  if (n.includes('mortgage')) return 'mortgage';
  if (n.includes('auto') || n.includes('car loan')) return 'auto_loan';
  if (n.includes('student')) return 'student_loan';
  if (n.includes('heloc') || n.includes('line of credit')) return 'heloc';
  if (n.includes('loan')) return 'personal_loan';
  if (n.includes('crypto') || n.includes('coinbase')) return 'crypto';
  return 'other';
}

function parseAccountLabel(label: string): { name: string; accountNumber: string | null } {
  const m = label.trim().match(/^(.*?)\s+(\d{4})\s*$/);
  if (m) return { name: m[1]!.trim(), accountNumber: m[2]! };
  return { name: label.trim(), accountNumber: null };
}

export function normalizeAccountNumber(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return String(raw).padStart(4, '0');
  return String(raw).trim();
}

function resolveAccountIdentity(
  label: string,
  accountNumberFromColumn: string | null,
): { name: string; accountNumber: string | null } {
  const parsed = parseAccountLabel(label);
  const accountNumber = accountNumberFromColumn ?? parsed.accountNumber;
  const labelTrim = label.trim();
  let name = labelTrim;
  if (accountNumber && labelTrim.endsWith(accountNumber)) {
    name = labelTrim.slice(0, -accountNumber.length).trim();
  }
  return { name, accountNumber };
}

export function contentHash(accountId: string, date: string, amount: string, raw: string): string {
  return createHash('sha256').update(`${accountId}|${date}|${amount}|${raw}`).digest('hex');
}

/**
 * Find an account by exact (name, number); else attach to a unique
 * account-number match; else create one with an inferred type.
 */
export async function getOrCreateAccount(
  label: string,
  accountNumberFromColumn: string | null,
): Promise<string> {
  const { name, accountNumber } = resolveAccountIdentity(label, accountNumberFromColumn);
  const existing = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.name, name), eq(accounts.accountNumber, accountNumber ?? '')));
  if (existing[0]) return existing[0].id;

  if (accountNumber) {
    const byNumber = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber));
    if (byNumber.length === 1) return byNumber[0]!.id;
  }

  const type = inferAccountType(name);
  const assetClass = assetClassForType(type);
  const display = accountNumber ? `${name} ••${accountNumber}` : name;
  const [row] = await db
    .insert(accounts)
    .values({ name, displayName: display, accountNumber, type, assetClass })
    .returning({ id: accounts.id });
  console.log(`  [+] Created account: ${display} (type=${type}, asset_class=${assetClass})`);
  return row!.id;
}

// ---------------------------------------------------------------------------
// Document ingestion (uncategorized rows from a parsed statement)
// ---------------------------------------------------------------------------

export type ParsedTxn = {
  date: string; // YYYY-MM-DD
  source: string;
  amount: number;
  balance: number | null;
};

export type IngestResult = {
  accountId: string;
  importId: string;
  inserted: number;
  skipped: number;
};

let uncategorizedIdCache: string | null = null;
async function uncategorizedId(): Promise<string> {
  if (uncategorizedIdCache) return uncategorizedIdCache;
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, UNCATEGORIZED_SLUG))
    .limit(1);
  if (!row) {
    throw new Error(
      `Taxonomy not seeded: '${UNCATEGORIZED_SLUG}' category missing. Run scripts/seed-categories.ts.`,
    );
  }
  uncategorizedIdCache = row.id;
  return row.id;
}

/** The vendor map: normalized merchant → categoryId. Loaded once per ingest. */
async function loadVendorMap(): Promise<Map<string, string>> {
  const rules = await db.select({ merchant: vendorRules.merchant, categoryId: vendorRules.categoryId }).from(vendorRules);
  return new Map(rules.map((r) => [r.merchant, r.categoryId]));
}

/**
 * Ingest one parsed statement's rows into the ledger. Resolves/creates the
 * account, records an `imports` provenance row, and inserts transactions
 * (Uncategorized + needs_review) with content-hash dedup. Idempotent: re-running
 * the same statement inserts nothing new.
 */
export async function ingestParsedStatement(args: {
  rows: ParsedTxn[];
  accountLabel: string;
  accountNumber: string | null;
  sourceFile: string;
  statementPeriod: string | null;
  documentId?: string;
}): Promise<IngestResult> {
  const { rows, accountLabel, accountNumber, sourceFile, statementPeriod, documentId } = args;
  const accountId = await getOrCreateAccount(accountLabel, accountNumber);
  const uncatId = await uncategorizedId();
  const vendorMap = await loadVendorMap();

  const [imp] = await db
    .insert(imports)
    .values({ sourceFile, statementPeriod: statementPeriod ?? null, accountId, documentId: documentId ?? null })
    .returning({ id: imports.id });
  const importId = imp!.id;

  const seen = new Set<string>();
  const values: (typeof transactions.$inferInsert)[] = [];
  for (const r of rows) {
    const amount = r.amount.toFixed(2);
    const hash = contentHash(accountId, r.date, amount, r.source);
    if (seen.has(hash)) continue;
    seen.add(hash);
    // Tier 1: a known merchant gets auto-categorized (no review); unknowns
    // fall to Uncategorized + needs_review for the queue / Claude.
    const merchant = cleanMerchant(r.source);
    const ruleCat = merchant ? vendorMap.get(merchant) : undefined;
    values.push({
      accountId,
      categoryId: ruleCat ?? uncatId,
      date: r.date,
      amount,
      rawDescription: r.source,
      merchant,
      needsReview: !ruleCat,
      isTransfer: false,
      statementPeriod: statementPeriod ?? null,
      sourceFile,
      importId,
      contentHash: hash,
    });
  }

  let inserted = 0;
  if (values.length > 0) {
    const insertedRows = await db
      .insert(transactions)
      .values(values)
      .onConflictDoNothing({ target: transactions.contentHash })
      .returning({ id: transactions.id });
    inserted = insertedRows.length;
  }
  const skipped = rows.length - inserted;

  await db
    .update(imports)
    .set({ rowCount: sql`(SELECT COUNT(*) FROM transactions WHERE import_id = ${importId})` })
    .where(eq(imports.id, importId));

  return { accountId, importId, inserted, skipped };
}

// ---------------------------------------------------------------------------
// Paystubs
// ---------------------------------------------------------------------------

export type ParsedPaystub = {
  pay_date: string | null;
  pay_period: string | null;
  voucher: string | null;
  base_comp: number | null;
  gross: number | null;
  net: number | null;
  hours: number | null;
  employer_total: number | null;
  deductions_total: number | null;
  taxes_total: number | null;
  employer: string | null;
  deposits: { bank: string; last4: string; amount: number }[];
};

export async function ingestPaystub(documentId: string, ps: ParsedPaystub, sourceFile: string): Promise<{ id: string | null }> {
  const num = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
  const [row] = await db
    .insert(paystubs)
    .values({
      documentId,
      payDate: ps.pay_date,
      payPeriod: ps.pay_period,
      voucher: ps.voucher,
      employer: ps.employer,
      baseComp: num(ps.base_comp),
      gross: num(ps.gross),
      net: num(ps.net),
      deductionsTotal: num(ps.deductions_total),
      taxesTotal: num(ps.taxes_total),
      employerTotal: num(ps.employer_total),
      hours: ps.hours != null ? ps.hours.toFixed(2) : null,
      deposits: ps.deposits ?? [],
      sourceFile,
    })
    .onConflictDoNothing({ target: paystubs.voucher })
    .returning({ id: paystubs.id });
  return { id: row?.id ?? null };
}
