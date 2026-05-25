/**
 * Custom report builder — runs a parameterized aggregation (group-by dimension +
 * filters) and manages saved query definitions (`report_queries`). Transfers are
 * always excluded; split parents are excluded for now (the builder is a fast
 * exploratory view, not the audited annual figures).
 */

import { type SQL, and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, reportQueries, transactions } from '@/lib/db/schema';
import type { ReportQueryDef, ReportResult, ReportResultRow, SavedQuery } from './query-types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function runQuery(def: ReportQueryDef): Promise<ReportResult> {
  const flowExpr = sql`COALESCE(${categories.flowType}, 'outflow')`;
  const conds: SQL[] = [eq(transactions.isTransfer, false), eq(transactions.isSplit, false)];
  if (def.flow === 'outflow') conds.push(sql`${flowExpr} = 'outflow'`);
  else if (def.flow === 'inflow') conds.push(sql`${flowExpr} = 'inflow'`);
  else conds.push(sql`${flowExpr} <> 'transfer'`);
  if (def.from) conds.push(gte(transactions.date, def.from));
  if (def.to) conds.push(lte(transactions.date, def.to));
  if (def.minAmount != null) conds.push(sql`ABS(${transactions.amount}) >= ${def.minAmount}`);
  if (def.maxAmount != null) conds.push(sql`ABS(${transactions.amount}) <= ${def.maxAmount}`);

  let keyExpr: SQL<string>;
  let labelExpr: SQL<string>;
  switch (def.groupBy) {
    case 'merchant':
      keyExpr = sql<string>`COALESCE(${transactions.merchant}, ${transactions.rawDescription})`;
      labelExpr = keyExpr;
      break;
    case 'account':
      keyExpr = sql<string>`${accounts.id}::text`;
      labelExpr = sql<string>`${accounts.displayName}`;
      break;
    case 'month':
      keyExpr = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
      labelExpr = keyExpr;
      break;
    case 'category':
    default:
      keyExpr = sql<string>`COALESCE(${categories.id}::text, 'uncat')`;
      labelExpr = sql<string>`COALESCE(${categories.name}, 'Uncategorized')`;
      break;
  }

  const rows = await db
    .select({
      key: keyExpr,
      label: labelExpr,
      total: sql<string>`SUM(ABS(${transactions.amount}))::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conds))
    .groupBy(keyExpr, labelExpr)
    .orderBy(def.groupBy === 'month' ? asc(keyExpr) : desc(sql`SUM(ABS(${transactions.amount}))`))
    .limit(200);

  const out: ReportResultRow[] = rows.map((r) => ({
    key: r.key ?? '—',
    label: r.label ?? '—',
    total: round2(Number(r.total)),
    count: Number(r.count),
  }));
  return {
    rows: out,
    total: round2(out.reduce((s, r) => s + r.total, 0)),
    count: out.reduce((s, r) => s + r.count, 0),
  };
}

export async function loadSavedQueries(): Promise<SavedQuery[]> {
  const rows = await db.select().from(reportQueries).orderBy(desc(reportQueries.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    definition: r.definition,
    createdAt: r.createdAt.toISOString(),
  }));
}
