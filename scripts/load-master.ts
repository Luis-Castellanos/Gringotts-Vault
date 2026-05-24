/**
 * Loads master.xlsx into the database. Two phases, both idempotent:
 *
 *   1. Sync taxonomy — reads the `Categories` sheet (Type / Category / Sub
 *      Category) and upserts a parent category per (Type, Category) and a child
 *      per Sub-category. flow_type comes straight from Type. Slugs are
 *      deterministic and Type-prefixed so repeated names (Zelle, Check, Other)
 *      don't collide across flow types.
 *   2. Import transactions — reads the `Transactions` sheet, resolves each row's
 *      category by its (Type, Category, Sub-category) names, sets isTransfer from
 *      Type, and inserts with ON CONFLICT DO NOTHING on content_hash. Unmatched
 *      category names fall back to Uncategorized + needs_review and are logged.
 *
 * Re-running on the same file is a no-op for transactions; the taxonomy is
 * re-synced (cheap upsert) every run.
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
import {
  CATEGORY_PALETTE,
  UNCATEGORIZED_SLUG,
  childSlug,
  parentSlug,
  typeToFlow,
  type Flow,
} from '@/lib/transactions/taxonomy';

// ---------------------------------------------------------------------------
// Account helpers (unchanged from prior loader)
// ---------------------------------------------------------------------------

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

  // Fallback: the master-file label's name may differ from the curated account
  // name (e.g. "Chase Prime" vs "Chase Prime Visa"). If the account number
  // uniquely identifies one existing account, attach to it instead of spawning a
  // duplicate. Ambiguous numbers (e.g. a shared last-4 across checking+savings)
  // fall through to creation, where the exact-name match above already handled
  // the legitimate cases.
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
  return row.id;
}

// ---------------------------------------------------------------------------
// Phase 1 — taxonomy sync
// ---------------------------------------------------------------------------

async function syncTaxonomy(wb: XLSX.WorkBook): Promise<Map<string, string>> {
  const sheet = wb.Sheets['Categories'];
  if (!sheet) throw new Error("No 'Categories' sheet found in workbook.");
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  type Node = { slug: string; name: string; flow: Flow; color: string; sortOrder: number; parentSlug?: string };
  const parents = new Map<string, Node>();
  const children = new Map<string, Node>();
  let parentOrder = 0;
  const childOrder = new Map<string, number>();

  for (const r of rows) {
    const type = String(r['Type'] ?? '').trim();
    const cat = String(r['Category'] ?? '').trim();
    const sub = String(r['Sub Category'] ?? '').trim();
    if (!type || !cat) continue;
    const flow = typeToFlow(type);

    const pSlug = parentSlug(flow, cat);
    if (!parents.has(pSlug)) {
      parents.set(pSlug, { slug: pSlug, name: cat, flow, color: CATEGORY_PALETTE[parents.size % CATEGORY_PALETTE.length], sortOrder: parentOrder++ });
    }
    if (sub) {
      const cSlug = childSlug(flow, cat, sub);
      if (!children.has(cSlug)) {
        const order = childOrder.get(pSlug) ?? 0;
        childOrder.set(pSlug, order + 1);
        children.set(cSlug, { slug: cSlug, name: sub, flow, color: parents.get(pSlug)!.color, sortOrder: order, parentSlug: pSlug });
      }
    }
  }

  for (const p of parents.values()) {
    await db
      .insert(categories)
      .values({ slug: p.slug, name: p.name, color: p.color, flowType: p.flow, sortOrder: p.sortOrder, isIncome: p.flow === 'inflow' })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: p.name, color: p.color, flowType: p.flow, sortOrder: p.sortOrder, isIncome: p.flow === 'inflow' },
      });
  }

  const afterParents = await db.select({ slug: categories.slug, id: categories.id }).from(categories);
  const idBySlug = new Map(afterParents.map((c) => [c.slug, c.id]));

  for (const c of children.values()) {
    const parentId = idBySlug.get(c.parentSlug!);
    await db
      .insert(categories)
      .values({ slug: c.slug, name: c.name, color: c.color, flowType: c.flow, sortOrder: c.sortOrder, isIncome: c.flow === 'inflow', parentId })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: c.name, color: c.color, flowType: c.flow, sortOrder: c.sortOrder, isIncome: c.flow === 'inflow', parentId },
      });
  }

  const refreshed = await db.select({ slug: categories.slug, id: categories.id }).from(categories);
  console.log(`  Taxonomy synced: ${parents.size} parents, ${children.size} children.`);
  return new Map(refreshed.map((c) => [c.slug, c.id]));
}

// ---------------------------------------------------------------------------
// Phase 2 — transaction import
// ---------------------------------------------------------------------------

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: npm run db:load-master <path-to-master.xlsx>');
    process.exit(1);
  }

  const fullPath = resolve(xlsxPath);
  console.log(`Reading ${fullPath}...`);
  const wb = XLSX.readFile(fullPath, { cellDates: true });

  console.log('Phase 1: syncing taxonomy...');
  const catMap = await syncTaxonomy(wb);
  const uncategorizedId = catMap.get(UNCATEGORIZED_SLUG);
  if (!uncategorizedId) {
    console.error(`  ! Fallback category '${UNCATEGORIZED_SLUG}' missing from taxonomy. Aborting.`);
    process.exit(1);
  }

  console.log('Phase 2: importing transactions...');
  const sheetName = wb.SheetNames.includes('Transactions') ? 'Transactions' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`  ${rows.length} rows in sheet '${sheetName}'`);

  type Row = {
    accountLabel: string;
    accountNumberFromCol: string | null;
    date: string;
    raw: string;
    amount: string;
    categoryId: string;
    needsReview: boolean;
    isTransfer: boolean;
    stmtPeriod: string | null;
    sourceFile: string | null;
  };
  const groups = new Map<string, Row[]>();
  const unmatched = new Map<string, number>();

  for (const r of rows) {
    const date = excelDateToISO(r['Date']);
    if (!date) continue;
    const accountLabel = String(r['Account'] ?? '').trim();
    if (!accountLabel) continue;
    const accountNumberFromCol = normalizeAccountNumber(r['Account #']);
    const raw = String(r['Source'] ?? '').trim();
    const amount = Number(r['Amount'] ?? 0).toFixed(2);

    const type = String(r['Type'] ?? '').trim();
    const cat = String(r['Category'] ?? '').trim();
    const sub = String(r['Sub-category'] ?? '').trim();
    const stmtPeriod = r['Stmt period'] ? String(r['Stmt period']).trim() : null;
    const sourceFile = r['Source file'] ? String(r['Source file']).trim() : null;

    const flow = typeToFlow(type);
    const slug = sub ? childSlug(flow, cat, sub) : parentSlug(flow, cat);
    let categoryId = catMap.get(slug);
    let needsReview = false;
    if (!categoryId) {
      categoryId = uncategorizedId;
      needsReview = true;
      const key = `${type || '∅'} / ${cat || '∅'} / ${sub || '∅'}`;
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    }
    const isTransfer = flow === 'transfer';

    const groupKey = `${accountLabel}${accountNumberFromCol ?? ''}${sourceFile ?? 'unknown'}`;
    const arr = groups.get(groupKey) ?? [];
    arr.push({ accountLabel, accountNumberFromCol, date, raw, amount, categoryId, needsReview, isTransfer, stmtPeriod, sourceFile });
    groups.set(groupKey, arr);
  }

  let inserted = 0;
  let skipped = 0;

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const accountId = await getOrCreateAccount(first.accountLabel, first.accountNumberFromCol);

    const [imp] = await db
      .insert(imports)
      .values({ sourceFile: first.sourceFile ?? 'unknown', statementPeriod: first.stmtPeriod ?? null, accountId })
      .returning({ id: imports.id });

    const seenInBatch = new Set<string>();
    const values: typeof transactions.$inferInsert[] = [];
    for (const r of groupRows) {
      const hash = contentHash(accountId, r.date, r.amount, r.raw);
      if (seenInBatch.has(hash)) continue;
      seenInBatch.add(hash);
      values.push({
        accountId,
        categoryId: r.categoryId,
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
    skipped += groupRows.length - values.length;

    await db
      .update(imports)
      .set({ rowCount: sql`(SELECT COUNT(*) FROM transactions WHERE import_id = ${imp.id})` })
      .where(eq(imports.id, imp.id));
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} duplicates.`);

  if (unmatched.size > 0) {
    const total = [...unmatched.values()].reduce((a, b) => a + b, 0);
    console.warn(`\n  ! ${total} rows across ${unmatched.size} unmatched category names → Uncategorized:`);
    for (const [key, n] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
      console.warn(`      ${n.toString().padStart(5)}  ${key}`);
    }
  }

  const reviewCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.needsReview, true));
  console.log(`\n  Review queue: ${reviewCount[0].n} transactions need categorization.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
