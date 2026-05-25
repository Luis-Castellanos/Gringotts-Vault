/**
 * Reports — annual summary (a year-end view: income sources, spending, net, and
 * a monthly trend). The first concrete report; the page is built to grow into
 * saved/custom reports later. Transfers are excluded (flow_type / isTransfer).
 */

import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

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

  const [byCat, byMonth] = await Promise.all([
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
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false)))
      .groupBy(categories.id, categories.name, categories.color, categories.flowType),
    db
      .select({
        m: sql<string>`EXTRACT(MONTH FROM ${transactions.date})::int::text`,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false)))
      .groupBy(sql`EXTRACT(MONTH FROM ${transactions.date})`, categories.flowType)
      .orderBy(asc(sql`EXTRACT(MONTH FROM ${transactions.date})`)),
  ]);

  const incomeByCategory: ReportCategory[] = [];
  const spendingByCategory: ReportCategory[] = [];
  let income = 0;
  let spending = 0;
  for (const c of byCat) {
    if (c.flow === 'transfer') continue;
    const amt = Number(c.total);
    if (c.flow === 'inflow') {
      income += amt;
      if (amt !== 0) incomeByCategory.push({ id: c.id, name: c.name, color: c.color, amount: round2(amt) });
    } else {
      spending += amt;
      const abs = Math.abs(amt);
      if (abs > 0) spendingByCategory.push({ id: c.id, name: c.name, color: c.color, amount: round2(abs) });
    }
  }
  incomeByCategory.sort((a, b) => b.amount - a.amount);
  spendingByCategory.sort((a, b) => b.amount - a.amount);

  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, income: 0, spending: 0, net: 0 }));
  for (const r of byMonth) {
    if (r.flow === 'transfer') continue;
    const idx = Number(r.m) - 1;
    if (idx < 0 || idx > 11) continue;
    const amt = Number(r.total);
    if (r.flow === 'inflow') months[idx]!.income += amt;
    else months[idx]!.spending += Math.abs(amt);
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
