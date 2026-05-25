/**
 * Export transactions to an .xlsx (the database → spreadsheet, on demand).
 *   GET /api/export/transactions?from=&to=&transfers=include|exclude&cols=a,b,c
 * Columns mirror the master file; `cols` (optional) selects a subset.
 */

import { NextRequest } from 'next/server';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import * as XLSX from 'xlsx';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Row = {
  date: string;
  accountName: string | null;
  accountNumber: string | null;
  source: string;
  merchant: string | null;
  amount: string;
  catName: string | null;
  parentName: string | null;
  flow: string | null;
  statementPeriod: string | null;
  sourceFile: string | null;
};

const FLOW_LABEL: Record<string, string> = { inflow: 'Inflows', outflow: 'Outflows', transfer: 'Transfers' };

// key → { header, value }. Order here is the default column order.
const COLUMNS: { key: string; header: string; value: (r: Row) => string | number | null }[] = [
  { key: 'date', header: 'Date', value: (r) => r.date },
  { key: 'account', header: 'Account', value: (r) => r.accountName },
  { key: 'accountNumber', header: 'Account #', value: (r) => r.accountNumber },
  { key: 'source', header: 'Source', value: (r) => r.source },
  { key: 'merchant', header: 'Merchant', value: (r) => r.merchant },
  { key: 'type', header: 'Type', value: (r) => (r.flow ? FLOW_LABEL[r.flow] ?? r.flow : '') },
  { key: 'category', header: 'Category', value: (r) => (r.parentName ?? r.catName) ?? '' },
  { key: 'subcategory', header: 'Sub-category', value: (r) => (r.parentName ? r.catName : '') ?? '' },
  { key: 'amount', header: 'Amount', value: (r) => Number(r.amount) },
  { key: 'period', header: 'Stmt period', value: (r) => r.statementPeriod },
  { key: 'sourceFile', header: 'Source file', value: (r) => r.sourceFile },
];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const transfers = sp.get('transfers') ?? 'include';
  const colsParam = sp.get('cols');
  const cols = colsParam ? COLUMNS.filter((c) => colsParam.split(',').includes(c.key)) : COLUMNS;

  const parentCat = alias(categories, 'parent_cat');
  const conds = [];
  if (from) conds.push(gte(transactions.date, from));
  if (to) conds.push(lte(transactions.date, to));
  if (transfers === 'exclude') conds.push(eq(transactions.isTransfer, false));

  const rows = (await db
    .select({
      date: transactions.date,
      accountName: accounts.displayName,
      accountNumber: accounts.accountNumber,
      source: transactions.rawDescription,
      merchant: transactions.merchant,
      amount: transactions.amount,
      catName: categories.name,
      parentName: parentCat.name,
      flow: categories.flowType,
      statementPeriod: transactions.statementPeriod,
      sourceFile: transactions.sourceFile,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(transactions.date))) as Row[];

  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, c.value(r)])));
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.header) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="vault-transactions-${stamp}.xlsx"`,
    },
  });
}
