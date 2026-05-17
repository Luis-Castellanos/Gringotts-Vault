/**
 * Loads master.xlsx into the database. Idempotent: re-running on the same
 * file is a no-op. Re-running after appending new rows inserts only the new
 * ones.
 *
 * Usage:
 *   npm run db:load-master "C:\path\to\master.xlsx"
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, imports, transactions } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';

const CATEGORY_MAP: Record<string, string> = {
  'Subscriptions & Software|Software & SaaS': 'software_saas',
  'Subscriptions & Software|News & Media': 'news_media',
  'Subscriptions & Software|Streaming': 'streaming',
  'Food & Dining|Restaurants': 'restaurants',
  'Food & Dining|Fast Food': 'fast_food',
  'Food & Dining|Coffee & Tea': 'coffee_tea',
  'Food & Dining|Groceries': 'groceries',
  'Food & Dining|Delivery': 'delivery',
  'Shopping|General Merchandise': 'general_merch',
  'Shopping|Clothing': 'clothing',
  'Shopping|Online Shopping': 'online_shopping',
  'Shopping|Electronics': 'electronics',
  'Transportation|Fuel': 'fuel',
  'Transportation|Rideshare': 'rideshare',
  'Financial|Credit Card Payment': 'credit_card_payment',
  'Financial|Transfer': 'transfer',
  'Financial|Fees': 'fees',
  'Uncategorized|Review': 'review',
};

const TRANSFER_SLUGS = new Set(['credit_card_payment', 'transfer']);

function inferAccountType(name: string): { type: typeof accounts.$inferInsert['type']; assetClass: 'asset' | 'liability' } {
  const n = name.toLowerCase();
  if (n.includes('card') || n.includes('visa') || n.includes('amex') || n.includes('mastercard')) return { type: 'credit_card', assetClass: 'liability' };
  if (n.includes('savings')) return { type: 'savings', assetClass: 'asset' };
  if (n.includes('checking')) return { type: 'checking', assetClass: 'asset' };
  if (n.includes('401') || n.includes('ira') || n.includes('roth')) return { type: 'retirement', assetClass: 'asset' };
  if (n.includes('brokerage') || n.includes('vanguard') || n.includes('fidelity')) return { type: 'brokerage', assetClass: 'asset' };
  if (n.includes('loan') || n.includes('mortgage') || n.includes('student')) return { type: 'loan', assetClass: 'liability' };
  return { type: 'other', assetClass: 'asset' };
}

function parseAccountLabel(label: string): { name: string; accountNumber: string | null } {
  const m = label.trim().match(/^(.*?)\s+(\d{4})\s*$/);
  if (m) return { name: m[1].trim(), accountNumber: m[2] };
  return { name: label.trim(), accountNumber: null };
}

function normalizeAccountNumber(raw: unknown): string | null {
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

function contentHash(accountId: string, date: string, amount: string, raw: string): string {
  return createHash('sha256').update(`${accountId}|${date}|${amount}|${raw}`).digest('hex');
}

function excelDateToISO(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    // Excel epoch is 1899-12-30. Add days.
    const ms = (value - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

async function getOrCreateAccount(
  label: string,
  accountNumberFromColumn: string | null,
): Promise<string> {
  const { name, accountNumber } = resolveAccountIdentity(label, accountNumberFromColumn);
  const existing = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.name, name), eq(accounts.accountNumber, accountNumber ?? '')));
  if (existing[0]) return existing[0].id;

  const { type, assetClass } = inferAccountType(name);
  const display = accountNumber ? `${name} ••${accountNumber}` : name;

  const [row] = await db
    .insert(accounts)
    .values({ name, displayName: display, accountNumber, type, assetClass })
    .returning({ id: accounts.id });

  console.log(`  [+] Created account: ${display} (type=${type}, asset_class=${assetClass})`);
  return row.id;
}

async function loadCategoryLookup(): Promise<Map<string, string>> {
  const rows = await db.select({ slug: categories.slug, id: categories.id }).from(categories);
  return new Map(rows.map((r) => [r.slug, r.id]));
}

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: npm run db:load-master <path-to-master.xlsx>');
    process.exit(1);
  }

  const fullPath = resolve(xlsxPath);
  console.log(`Reading ${fullPath}...`);

  const wb = XLSX.readFile(fullPath, { cellDates: true });
  const sheetName = wb.SheetNames.includes('Transactions') ? 'Transactions' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`  ${rows.length} rows in sheet '${sheetName}'`);

  const catLookup = await loadCategoryLookup();
  if (catLookup.size === 0) {
    console.error('Categories table is empty. Run npm run db:seed first.');
    process.exit(1);
  }

  type Row = {
    accountLabel: string;
    accountNumberFromCol: string | null;
    date: string;
    raw: string;
    amount: string;
    catSlug: string;
    needsReview: boolean;
    isTransfer: boolean;
    stmtPeriod: string | null;
    sourceFile: string | null;
  };
  const groups = new Map<string, Row[]>();

  for (const r of rows) {
    const date = excelDateToISO(r['Date']);
    if (!date) continue;
    const accountLabel = String(r['Account'] ?? '').trim();
    if (!accountLabel) continue;
    const accountNumberFromCol = normalizeAccountNumber(r['Account #']);
    const raw = String(r['Source'] ?? '').trim();
    const amount = Number(r['Amount'] ?? 0).toFixed(2);
    const cat = String(r['Category'] ?? '').trim();
    const sub = String(r['Sub-category'] ?? '').trim();
    const stmtPeriod = r['Stmt period'] ? String(r['Stmt period']).trim() : null;
    const sourceFile = r['Source file'] ? String(r['Source file']).trim() : null;

    const slug = CATEGORY_MAP[`${cat}|${sub}`] ?? 'review';
    const needsReview = slug === 'review';
    const isTransfer = TRANSFER_SLUGS.has(slug);

    const key = `${accountLabel}${accountNumberFromCol ?? ''}${sourceFile ?? 'unknown'}`;
    const arr = groups.get(key) ?? [];
    arr.push({ accountLabel, accountNumberFromCol, date, raw, amount, catSlug: slug, needsReview, isTransfer, stmtPeriod, sourceFile });
    groups.set(key, arr);
  }

  let inserted = 0;
  let skipped = 0;

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const accountId = await getOrCreateAccount(first.accountLabel, first.accountNumberFromCol);
    const stmtPeriod = first.stmtPeriod ?? null;
    const sourceFile = first.sourceFile;

    const [imp] = await db
      .insert(imports)
      .values({ sourceFile: sourceFile ?? 'unknown', statementPeriod: stmtPeriod, accountId })
      .returning({ id: imports.id });

    // Build the batch up-front, de-duping within the group by content hash so
    // a single INSERT can't violate the unique constraint twice on the same key
    // (Postgres rejects that as a cardinality violation even with ON CONFLICT).
    const seenInBatch = new Set<string>();
    const values: typeof transactions.$inferInsert[] = [];
    for (const r of groupRows) {
      const hash = contentHash(accountId, r.date, r.amount, r.raw);
      if (seenInBatch.has(hash)) continue;
      seenInBatch.add(hash);
      values.push({
        accountId,
        categoryId: catLookup.get(r.catSlug) ?? catLookup.get('review')!,
        date: r.date,
        amount: r.amount,
        rawDescription: r.raw,
        merchant: cleanMerchant(r.raw),
        needsReview: r.needsReview,
        isTransfer: r.isTransfer,
        statementPeriod: r.stmtPeriod,
        sourceFile: r.sourceFile,
        importId: imp.id,
        contentHash: hash,
      });
    }

    if (values.length > 0) {
      const insertedRows = await db
        .insert(transactions)
        .values(values)
        .onConflictDoNothing({ target: transactions.contentHash })
        .returning({ id: transactions.id });
      inserted += insertedRows.length;
      skipped += values.length - insertedRows.length;
    }
    // Rows dropped by intra-batch dedup are also counted as skipped.
    skipped += groupRows.length - values.length;

    await db
      .update(imports)
      .set({ rowCount: sql`(SELECT COUNT(*) FROM transactions WHERE import_id = ${imp.id})` })
      .where(eq(imports.id, imp.id));
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} duplicates.`);

  const reviewCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.needsReview, true));
  console.log(`  Review queue: ${reviewCount[0].n} transactions need categorization.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});