/**
 * Shared ingestion primitives — account resolution, dedup hashing, and the
 * transaction writer. Used by both the offline `scripts/load-master.ts` loader
 * and the in-app upload pipeline (`app/api/documents/upload`).
 *
 * The parser does NOT categorize, so transactions ingested from a parsed
 * statement land as Uncategorized + needs_review and flow into the Review page.
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, balanceSnapshots, categories, holdings as holdingsTable, imports, paystubs, transactions, vendorRules } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';
import { UNCATEGORIZED_SLUG } from '@/lib/transactions/taxonomy';
import { classifyByRules } from '@/lib/categorize/rules';
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

/**
 * Read-only account resolution for the import dry-run: mirror getOrCreateAccount's
 * lookup (exact name+number, then unique number match) but never create. Returns
 * the resolved display name and whether it already exists.
 */
export async function resolveAccountPreview(
  label: string,
  accountNumberFromColumn: string | null,
): Promise<{ id: string | null; name: string; display: string }> {
  const { name, accountNumber } = resolveAccountIdentity(label, accountNumberFromColumn);
  const display = accountNumber ? `${name} ••${accountNumber}` : name;
  const exact = await db
    .select({ id: accounts.id, display: accounts.displayName })
    .from(accounts)
    .where(and(eq(accounts.name, name), eq(accounts.accountNumber, accountNumber ?? '')));
  if (exact[0]) return { id: exact[0].id, name, display: exact[0].display };
  if (accountNumber) {
    const byNumber = await db.select({ id: accounts.id, display: accounts.displayName }).from(accounts).where(eq(accounts.accountNumber, accountNumber));
    if (byNumber.length === 1) return { id: byNumber[0]!.id, name, display: byNumber[0]!.display };
  }
  return { id: null, name, display };
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

// Statement-stated audit control totals (see parser extract_statement_summary).
export type ParsedStatementSummary = {
  period_start: string | null;
  period_end: string | null;
  beginning_balance: number | null;
  ending_balance: number | null;
  stated_credits: number | null;
  stated_debits: number | null;
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
 * Category lookups for tier-2 rule categorization: slug → {id, isTransfer} for
 * applying a rule hit, and id → isTransfer so a vendor-map hit on a transfer
 * category also flips is_transfer. Loaded once per ingest.
 */
async function loadCategoryMaps(): Promise<{
  bySlug: Map<string, { id: string; isTransfer: boolean }>;
  isTransferById: Map<string, boolean>;
}> {
  const rows = await db.select({ id: categories.id, slug: categories.slug, flow: categories.flowType }).from(categories);
  const bySlug = new Map(rows.map((c) => [c.slug, { id: c.id, isTransfer: c.flow === 'transfer' }]));
  const isTransferById = new Map(rows.map((c) => [c.id, c.flow === 'transfer']));
  return { bySlug, isTransferById };
}

/** The lookup maps an ingest needs: uncategorized id, vendor map, category maps. */
export type IngestMaps = {
  uncatId: string;
  vendorMap: Map<string, string>;
  catMaps: Awaited<ReturnType<typeof loadCategoryMaps>>;
};

/**
 * Load the per-batch lookup maps once so they can be reused across every file in
 * an upload batch — `vendor_rules` is ~4k rows, so reloading it per file (as a
 * bare `ingestParsedStatement` call does) is pure waste. Optional everywhere:
 * `ingestParsedStatement` loads them itself when not supplied.
 */
export async function loadIngestMaps(): Promise<IngestMaps> {
  const [uncatId, vendorMap, catMaps] = await Promise.all([
    uncategorizedId(),
    loadVendorMap(),
    loadCategoryMaps(),
  ]);
  return { uncatId, vendorMap, catMaps };
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
  summary?: ParsedStatementSummary | null;
  documentId?: string;
  /** Pre-loaded batch maps; loaded on demand if omitted. See loadIngestMaps. */
  maps?: IngestMaps;
}): Promise<IngestResult> {
  const { rows, accountLabel, accountNumber, sourceFile, statementPeriod, summary, documentId } = args;
  const accountId = await getOrCreateAccount(accountLabel, accountNumber);
  const { uncatId, vendorMap, catMaps } = args.maps ?? (await loadIngestMaps());

  // numeric columns take string | null in drizzle.
  const money = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));

  const [imp] = await db
    .insert(imports)
    .values({
      sourceFile,
      statementPeriod: statementPeriod ?? null,
      accountId,
      documentId: documentId ?? null,
      periodStart: summary?.period_start ?? null,
      periodEnd: summary?.period_end ?? null,
      beginningBalance: money(summary?.beginning_balance),
      endingBalance: money(summary?.ending_balance),
      statedCredits: money(summary?.stated_credits),
      statedDebits: money(summary?.stated_debits),
    })
    .returning({ id: imports.id });
  const importId = imp!.id;

  const seen = new Set<string>();
  const values: (typeof transactions.$inferInsert)[] = [];
  for (const r of rows) {
    const amount = r.amount.toFixed(2);
    const hash = contentHash(accountId, r.date, amount, r.source);
    if (seen.has(hash)) continue;
    seen.add(hash);
    // Tiered categorization:
    //   1. vendor-map exact match on the cleaned merchant → confirmed.
    //   2. rule patterns on the raw text (transfers/Zelle/ATM/…) → high-confidence
    //      confirmed, low-confidence (spend guesses) suggested (kept in review).
    //   3. neither → Uncategorized + needs_review for the queue / Claude.
    const merchant = cleanMerchant(r.source);
    let categoryId: string = uncatId;
    let needsReview = true;
    let isTransfer = false;
    const ruleCat = merchant ? vendorMap.get(merchant) : undefined;
    if (ruleCat) {
      categoryId = ruleCat;
      needsReview = false;
      isTransfer = catMaps.isTransferById.get(ruleCat) ?? false;
    } else {
      const hit = classifyByRules(r.source, r.amount);
      const cat = hit ? catMaps.bySlug.get(hit.slug) : undefined;
      if (hit && cat) {
        categoryId = cat.id;
        needsReview = hit.confidence === 'low';
        isTransfer = cat.isTransfer;
      }
    }
    values.push({
      accountId,
      categoryId,
      date: r.date,
      amount,
      balance: money(r.balance),
      rawDescription: r.source,
      merchant,
      needsReview,
      isTransfer,
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

/**
 * Dry-run an ingest: predict the resolved account, how many rows are new vs
 * already in the ledger (content-hash check), and whether the statement's stated
 * control totals reconcile against the parsed rows. No writes.
 */
export type IngestPreview = {
  accountName: string;
  accountExists: boolean;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  reconciles: boolean | null; // null when the statement prints no stated totals
  endDelta: number | null; // derived end − stated end
};

export async function previewIngest(args: {
  rows: ParsedTxn[];
  accountLabel: string;
  accountNumber: string | null;
  summary?: ParsedStatementSummary | null;
}): Promise<IngestPreview> {
  const { rows, accountLabel, accountNumber, summary } = args;
  const acct = await resolveAccountPreview(accountLabel, accountNumber);

  // Unique content hashes for this statement's rows (dedup within the file first).
  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const r of rows) {
    if (!acct.id) { seen.add(`${r.date}|${r.amount.toFixed(2)}|${r.source}`); continue; }
    const h = contentHash(acct.id, r.date, r.amount.toFixed(2), r.source);
    if (seen.has(h)) continue;
    seen.add(h);
    hashes.push(h);
  }

  let duplicateRows: number;
  if (!acct.id) {
    // Brand-new account → nothing in the ledger yet; only in-file dupes are dupes.
    const uniqueInFile = seen.size;
    duplicateRows = rows.length - uniqueInFile;
  } else {
    const existing = hashes.length
      ? await db
          .select({ h: transactions.contentHash })
          .from(transactions)
          .where(and(eq(transactions.accountId, acct.id), inArray(transactions.contentHash, hashes)))
      : [];
    const existingSet = new Set(existing.map((e) => e.h));
    const inLedger = hashes.filter((h) => existingSet.has(h)).length;
    const inFileDupes = rows.length - hashes.length;
    duplicateRows = inLedger + inFileDupes;
  }
  const newRows = rows.length - duplicateRows;

  // Reconciliation from stated control totals.
  let reconciles: boolean | null = null;
  let endDelta: number | null = null;
  const begin = summary?.beginning_balance ?? null;
  const end = summary?.ending_balance ?? null;
  if (begin != null && end != null) {
    const net = rows.reduce((s, r) => s + r.amount, 0);
    endDelta = Math.round((begin + net - end) * 100) / 100;
    reconciles = Math.abs(endDelta) <= 0.01;
  }

  return {
    accountName: acct.display,
    accountExists: acct.id != null,
    totalRows: rows.length,
    newRows,
    duplicateRows,
    reconciles,
    endDelta,
  };
}

// ---------------------------------------------------------------------------
// Holdings (investment positions from a brokerage/retirement statement)
// ---------------------------------------------------------------------------

export type ParsedHolding = {
  symbol: string | null;
  name: string;
  assetClass: string;
  quantity: number | null;
  price: number | null;
  value: number | null;
  costBasis: number | null;
  asOf: string | null;
};

/**
 * Ingest a statement's holdings (positions) for an account. Idempotent per
 * snapshot: re-uploading a statement replaces that account's positions for the
 * same `as_of` date (delete-then-insert), so the Investments view always shows
 * one set per statement date. Resolves/creates the account from its label.
 */
export async function ingestHoldings(args: {
  accountLabel: string;
  accountNumber: string | null;
  holdings: ParsedHolding[];
  importId?: string;
}): Promise<{ accountId: string; inserted: number }> {
  const accountId = await getOrCreateAccount(args.accountLabel, args.accountNumber);
  const rows = args.holdings.filter((h) => h.value != null || h.quantity != null);
  if (rows.length === 0) return { accountId, inserted: 0 };

  const money = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
  const price = (n: number | null | undefined) => (n == null ? null : n.toFixed(4));
  const qty = (n: number | null | undefined) => (n == null ? null : n.toFixed(6));

  // Replace each as_of snapshot for this account so re-uploads don't duplicate.
  const asOfs = [...new Set(rows.map((h) => h.asOf).filter((d): d is string => !!d))];
  for (const a of asOfs) {
    await db.delete(holdingsTable).where(and(eq(holdingsTable.accountId, accountId), eq(holdingsTable.asOf, a)));
  }

  const values = rows.map((h) => ({
    accountId,
    symbol: h.symbol,
    name: h.name,
    assetClass: h.assetClass || 'other',
    quantity: qty(h.quantity),
    costBasis: money(h.costBasis),
    statementPrice: price(h.price),
    statementValue: money(h.value),
    asOf: h.asOf,
    importId: args.importId ?? null,
  }));
  await db.insert(holdingsTable).values(values);
  return { accountId, inserted: values.length };
}

/**
 * Record a loan statement's stated balance as a `balance_snapshots` row (e.g. a
 * mortgage's unpaid principal). The mortgage payment itself is captured on the
 * checking side (split), so the loan statement contributes only the authoritative
 * balance — buildMortgage prefers the latest snapshot. Idempotent per
 * (account, as_of). No ledger transactions (avoids double-count + balance skew).
 */
export async function ingestBalanceSnapshot(args: {
  accountLabel: string;
  accountNumber: string | null;
  asOf: string;
  balance: number;
}): Promise<{ accountId: string }> {
  const accountId = await getOrCreateAccount(args.accountLabel, args.accountNumber);
  await db
    .insert(balanceSnapshots)
    .values({ accountId, asOfDate: args.asOf, balance: args.balance.toFixed(2), source: 'statement' })
    .onConflictDoUpdate({
      target: [balanceSnapshots.accountId, balanceSnapshots.asOfDate],
      set: { balance: args.balance.toFixed(2), source: 'statement' },
    });
  return { accountId };
}

// ---------------------------------------------------------------------------
// Paystubs
// ---------------------------------------------------------------------------

export type ParsedPaystubLine = { label: string; amount: number };

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
  non_cash_fringe: number | null;
  employer: string | null;
  deposits: { bank: string; last4: string; amount: number }[];
  earnings: ParsedPaystubLine[];
  deductions: ParsedPaystubLine[];
  taxes: ParsedPaystubLine[];
  employer_contributions: ParsedPaystubLine[];
  imputed: ParsedPaystubLine[];
  tax_settings: {
    filing_status: string | null;
    federal: string | null;
    claim_dependent: number | null;
    deduction: number | null;
    other_income: number | null;
    allowances: number | null;
    additional_allowances: number | null;
    two_jobs: string | null;
    supplemental_type: string | null;
  } | null;
};

export async function ingestPaystub(documentId: string, ps: ParsedPaystub, sourceFile: string): Promise<{ id: string | null }> {
  const num = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
  const lines = (a: ParsedPaystubLine[] | undefined) => (a && a.length ? a : null);
  const ts = ps.tax_settings;
  const taxSettings = ts
    ? {
        filingStatus: ts.filing_status,
        federal: ts.federal,
        claimDependent: ts.claim_dependent,
        deduction: ts.deduction,
        otherIncome: ts.other_income,
        allowances: ts.allowances,
        additionalAllowances: ts.additional_allowances,
        twoJobs: ts.two_jobs,
        supplementalType: ts.supplemental_type,
      }
    : null;
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
      nonCashFringe: num(ps.non_cash_fringe),
      deposits: ps.deposits ?? [],
      earnings: lines(ps.earnings),
      deductions: lines(ps.deductions),
      taxes: lines(ps.taxes),
      employerContributions: lines(ps.employer_contributions),
      imputed: lines(ps.imputed),
      taxSettings,
      sourceFile,
    })
    .onConflictDoNothing({ target: paystubs.voucher })
    .returning({ id: paystubs.id });
  return { id: row?.id ?? null };
}
