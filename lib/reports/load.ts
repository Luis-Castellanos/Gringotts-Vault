/**
 * Reports — annual summary (a year-end view: income sources, spending, net, and
 * a monthly trend). The first concrete report; the page is built to grow into
 * saved/custom reports later. Transfers are excluded (flow_type / isTransfer).
 */

import { and, asc, desc, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { loadSplitContributions } from '@/lib/transactions/split';

export type TopMerchant = { merchant: string; amount: number; count: number };

/** Top spending merchants for a year (outflows, excluding transfers/splits). */
export async function loadTopMerchants(year: number, limit = 12): Promise<TopMerchant[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const nameExpr = sql<string>`COALESCE(NULLIF(${transactions.merchant}, ''), ${transactions.rawDescription})`;
  const rows = await db
    .select({
      merchant: nameExpr,
      amount: sql<string>`SUM(ABS(${transactions.amount}))::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        lt(transactions.amount, '0'),
        eq(transactions.isTransfer, false),
        eq(transactions.isSplit, false),
        ne(sql`COALESCE(${categories.flowType}, 'outflow')`, 'inflow'),
        ne(sql`COALESCE(${categories.flowType}, 'outflow')`, 'transfer'),
      ),
    )
    .groupBy(nameExpr)
    .orderBy(desc(sql`SUM(ABS(${transactions.amount}))`))
    .limit(limit);
  return rows.map((r) => ({ merchant: r.merchant ?? '—', amount: Math.round(Number(r.amount) * 100) / 100, count: Number(r.count) }));
}

export type ReportCategory = { id: string; name: string; color: string | null; amount: number };
export type MonthPoint = { month: number; income: number; spending: number; net: number };

export type AnnualReport = {
  year: number;
  income: number;
  spending: number;
  net: number;
  savingsRate: number | null;
  incomeByCategory: ReportCategory[];
  spendingByCategory: ReportCategory[];
  months: MonthPoint[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct calendar years present in the ledger (desc). */
export async function loadReportYears(): Promise<number[]> {
  const rows = await db
    .select({ y: sql<string>`DISTINCT EXTRACT(YEAR FROM ${transactions.date})::int::text` })
    .from(transactions);
  return rows.map((r) => Number(r.y)).sort((a, b) => b - a);
}

export async function loadAnnualReport(year: number): Promise<AnnualReport> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [byCat, byMonth, splitContribs] = await Promise.all([
    db
      .select({
        id: sql<string>`COALESCE(${categories.id}::text, 'uncat')`,
        name: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        color: categories.color,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false), eq(transactions.isSplit, false)))
      .groupBy(categories.id, categories.name, categories.color, categories.flowType),
    db
      .select({
        m: sql<string>`EXTRACT(MONTH FROM ${transactions.date})::int::text`,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false), eq(transactions.isSplit, false)))
      .groupBy(sql`EXTRACT(MONTH FROM ${transactions.date})`, categories.flowType)
      .orderBy(asc(sql`EXTRACT(MONTH FROM ${transactions.date})`)),
    loadSplitContributions({ from: start, to: end }),
  ]);

  // Income/spending by category — accumulate into maps so split parts (which
  // arrive per-row, not pre-aggregated) merge into the same category buckets.
  const incomeMap = new Map<string, ReportCategory>();
  const spendMap = new Map<string, ReportCategory>();
  let income = 0;
  let spending = 0;
  const addCat = (map: Map<string, ReportCategory>, id: string, name: string, color: string | null, amt: number) => {
    const e = map.get(id);
    if (e) e.amount = round2(e.amount + amt);
    else map.set(id, { id, name, color, amount: round2(amt) });
  };
  for (const c of byCat) {
    if (c.flow === 'transfer') continue;
    const amt = Number(c.total);
    if (c.flow === 'inflow') { income += amt; if (amt !== 0) addCat(incomeMap, c.id, c.name, c.color, amt); }
    else { spending += amt; if (Math.abs(amt) > 0) addCat(spendMap, c.id, c.name, c.color, Math.abs(amt)); }
  }
  for (const s of splitContribs) {
    const flow = s.flowType === 'inflow' ? 'inflow' : s.flowType === 'transfer' ? 'transfer' : 'outflow';
    if (flow === 'transfer') continue;
    const id = s.catId ?? 'uncat';
    const name = s.catName ?? 'Uncategorized';
    if (flow === 'inflow') { income += s.amount; if (s.amount !== 0) addCat(incomeMap, id, name, s.catColor, s.amount); }
    else { spending += s.amount; if (Math.abs(s.amount) > 0) addCat(spendMap, id, name, s.catColor, Math.abs(s.amount)); }
  }
  const incomeByCategory = [...incomeMap.values()].sort((a, b) => b.amount - a.amount);
  const spendingByCategory = [...spendMap.values()].sort((a, b) => b.amount - a.amount);

  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, spending: 0, net: 0 }));
  for (const r of byMonth) {
    if (r.flow === 'transfer') continue;
    const idx = Number(r.m) - 1;
    if (idx < 0 || idx > 11) continue;
    const amt = Number(r.total);
    if (r.flow === 'inflow') months[idx]!.income += amt;
    else months[idx]!.spending += Math.abs(amt);
  }
  for (const s of splitContribs) {
    const idx = Number(s.date.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    const flow = s.flowType === 'inflow' ? 'inflow' : s.flowType === 'transfer' ? 'transfer' : 'outflow';
    if (flow === 'inflow') months[idx]!.income += s.amount;
    else if (flow !== 'transfer') months[idx]!.spending += Math.abs(s.amount);
  }
  for (const m of months) {
    m.income = round2(m.income);
    m.spending = round2(m.spending);
    m.net = round2(m.income - m.spending);
  }

  income = round2(income);
  spending = round2(Math.abs(spending));
  const net = round2(income - spending);
  return {
    year,
    income,
    spending,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
    incomeByCategory,
    spendingByCategory,
    months,
  };
}
