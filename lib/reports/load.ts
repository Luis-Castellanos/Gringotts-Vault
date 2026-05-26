/**
 * Reports — annual summary (a year-end view: income sources, spending, net, and
 * a monthly trend). The first concrete report; the page is built to grow into
 * saved/custom reports later. Transfers are excluded (flow_type / isTransfer).
 */

import { and, desc, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { loadSplitContributions } from '@/lib/transactions/split';

export type TopMerchant = { merchant: string; amount: number; count: number };

/** Top spending merchants for a date range (outflows, excluding transfers/splits). */
export async function loadTopMerchants(from: string, to: string, limit = 12): Promise<TopMerchant[]> {
  const start = from;
  const end = to;
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
export type MonthPoint = { key: string; label: string; income: number; spending: number; net: number };

export type AnnualReport = {
  from: string;
  to: string;
  label: string;
  income: number;
  spending: number;
  net: number;
  savingsRate: number | null;
  incomeByCategory: ReportCategory[];
  spendingByCategory: ReportCategory[];
  months: MonthPoint[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YYYY-MM keys from `from` to `to` inclusive. */
function monthsInRange(from: string, to: string): string[] {
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  const out: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
    if (out.length > 240) break; // safety
  }
  return out;
}

/** Distinct calendar years present in the ledger (desc). */
export async function loadReportYears(): Promise<number[]> {
  const rows = await db
    .select({ y: sql<string>`DISTINCT EXTRACT(YEAR FROM ${transactions.date})::int::text` })
    .from(transactions);
  return rows.map((r) => Number(r.y)).sort((a, b) => b - a);
}

/** Back-compat: a full calendar year. */
export function loadAnnualReport(year: number): Promise<AnnualReport> {
  return loadReport(`${year}-01-01`, `${year}-12-31`, String(year));
}

/** Income/spending/net summary for an arbitrary date range, bucketed by month. */
export async function loadReport(from: string, to: string, label: string): Promise<AnnualReport> {
  const start = from;
  const end = to;

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
        ym: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false), eq(transactions.isSplit, false)))
      .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`, categories.flowType),
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

  // Monthly buckets across the range (YYYY-MM), zero-filled + labeled.
  const keys = monthsInRange(from, to);
  const multiYear = new Set(keys.map((k) => k.slice(0, 4))).size > 1;
  const byKey = new Map<string, MonthPoint>();
  for (const k of keys) {
    const mm = Number(k.slice(5, 7));
    byKey.set(k, { key: k, label: MONTH_ABBR[mm - 1]! + (multiYear ? ` ’${k.slice(2, 4)}` : ''), income: 0, spending: 0, net: 0 });
  }
  for (const r of byMonth) {
    if (r.flow === 'transfer') continue;
    const mp = byKey.get(r.ym);
    if (!mp) continue;
    const amt = Number(r.total);
    if (r.flow === 'inflow') mp.income += amt;
    else mp.spending += Math.abs(amt);
  }
  for (const s of splitContribs) {
    const mp = byKey.get(s.date.slice(0, 7));
    if (!mp) continue;
    const flow = s.flowType === 'inflow' ? 'inflow' : s.flowType === 'transfer' ? 'transfer' : 'outflow';
    if (flow === 'inflow') mp.income += s.amount;
    else if (flow !== 'transfer') mp.spending += Math.abs(s.amount);
  }
  const months: MonthPoint[] = keys.map((k) => {
    const m = byKey.get(k)!;
    return { key: m.key, label: m.label, income: round2(m.income), spending: round2(m.spending), net: round2(m.income - m.spending) };
  });

  income = round2(income);
  spending = round2(Math.abs(spending));
  const net = round2(income - spending);
  return {
    from,
    to,
    label,
    income,
    spending,
    net,
    savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
    incomeByCategory,
    spendingByCategory,
    months,
  };
}
