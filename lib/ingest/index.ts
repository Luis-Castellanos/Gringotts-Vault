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
import { accounts, categories, imports, transactions } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';
import { UNCATEGORIZED_SLUG } from '@/lib/transactions/taxonomy';

// ---------------------------------------------------------------------------
// Account identity
// ---------------------------------------------------------------------------

export function inferAccountType(name: string): {
  type: (typeof accounts.$inferInsert)['type'];
  assetClass: 'asset' | 'liability';
} {
  const n = name.toLowerCase();
  if (n.includes('card') || n.includes('visa') || n.includes('amex') || n.includes('mastercard'))
    return { type: 'credit_card', assetClass: 'liability' };
  if (n.includes('savings')) return { type: 'savings', assetClass: 'asset' };
  if (n.includes('checking')) return { type: 'checking', assetClass: 'asset' };
  if (n.includes('401') || n.includes('ira') || n.includes('roth')) return { type: 'retirement', assetClass: 'asset' };
  if (n.includes('brokerage') || n.includes('vanguard') || n.includes('fidelity')) return { type: 'brokerage', assetClass: 'asset' };
  if (n.includes('loan') || n.includes('mortgage') || n.includes('student')) return { type: 'loan', assetClass: 'liability' };
  return { type: 'other', assetClass: 'asset' };
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

  const { type, assetClass } = inferAccountType(name);
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
}): Promise<IngestResult> {
  const { rows, accountLabel, accountNumber, sourceFile, statementPeriod } = args;
  const accountId = await getOrCreateAccount(accountLabel, accountNumber);
  const categoryId = await uncategorizedId();

  const [imp] = await db
    .insert(imports)
    .values({ sourceFile, statementPeriod: statementPeriod ?? null, accountId })
    .returning({ id: imports.id });
  const importId = imp!.id;

  const seen = new Set<string>();
  const values: (typeof transactions.$inferInsert)[] = [];
  for (const r of rows) {
    const amount = r.amount.toFixed(2);
    const hash = contentHash(accountId, r.date, amount, r.source);
    if (seen.has(hash)) continue;
    seen.add(hash);
    values.push({
      accountId,
      categoryId,
      date: r.date,
      amount,
      rawDescription: r.source,
      merchant: cleanMerchant(r.source),
      needsReview: true,
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
