/**
 * Dashboard data — the at-a-glance landing view. One parallel batch of queries:
 * net-worth series (sparkline + headline), this-month cashflow, top spending
 * categories this month, and grouped account balances.
 */

import { and, asc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';

export type NWPoint = { date: string; value: number };
export type TopCategory = { id: string; name: string; color: string | null; amount: number };
export type AccountBalance = { id: string; name: string; type: string; balance: number };
export type AccountGroup = { key: 'cash' | 'investments' | 'liabilities'; label: string; total: number; accounts: AccountBalance[] };

export type DashboardData = {
  netWorth: number;
  nwDelta30: number;
  nwSeries: NWPoint[];
  monthLabel: string;
  income: number;
  spending: number;
  net: number;
  topCategories: TopCategory[];
  groups: AccountGroup[];
  reviewCount: number;
};

const MS_DAY = 86_400_000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => todayISO().slice(0, 8) + '01';
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadDashboard(): Promise<DashboardData> {
  const monthStart = monthStartISO();
  const today = todayISO();
  const thirtyAgo = new Date(Date.now() - 30 * MS_DAY).toISOString().slice(0, 10);

  const [dailyRows, acctRows, monthFlows, topCats, reviewRows] = await Promise.all([
    // Daily net across all accounts → cumulative net-worth series.
    db
      .select({ date: transactions.date, net: sql<string>`SUM(${transactions.amount})::text` })
      .from(transactions)
      .groupBy(transactions.date)
      .orderBy(asc(transactions.date)),
    // Per-account balance + metadata.
    db
      .select({
        id: accounts.id,
        name: accounts.displayName,
        type: accounts.type,
        assetClass: accounts.assetClass,
        isActive: accounts.isActive,
        balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .groupBy(accounts.id),
    // This month's income vs spending by flow_type (transfers excluded).
    db
      .select({
        flow: categories.flowType,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, monthStart), eq(transactions.isTransfer, false)))
      .groupBy(categories.flowType),
    // Top spending categories this month (outflow only).
    db
      .select({
        id: sql<string>`COALESCE(${categories.id}::text, 'uncat')`,
        name: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        color: categories.color,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          gte(transactions.date, monthStart),
          eq(transactions.isTransfer, false),
          sql`COALESCE(${categories.flowType}, 'outflow') = 'outflow'`,
        ),
      )
      .groupBy(categories.id, categories.name, categories.color),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.needsReview, true)),
  ]);

  // Net-worth series (cumulative).
  const nwSeries: NWPoint[] = [];
  let running = 0;
  let delta30 = 0;
  for (const r of dailyRows) {
    const net = Number(r.net);
    running += net;
    if (r.date >= thirtyAgo) delta30 += net;
    nwSeries.push({ date: r.date, value: Math.round(running) });
  }
  if (nwSeries.length && nwSeries[nwSeries.length - 1]!.date < today) {
    nwSeries.push({ date: today, value: nwSeries[nwSeries.length - 1]!.value });
  }
  const netWorth = nwSeries.length ? nwSeries[nwSeries.length - 1]!.value : 0;

  // This-month cashflow.
  let income = 0;
  let spending = 0;
  for (const r of monthFlows) {
    const v = Number(r.total);
    if (r.flow === 'inflow') income += v;
    else if (r.flow === 'transfer') continue;
    else spending += v; // outflow (and null) — stored negative
  }
  income = round2(income);
  spending = round2(Math.abs(spending));
  const net = round2(income - spending);

  // Top spending categories (outflow amounts are negative → abs, sort desc).
  const topCategories: TopCategory[] = topCats
    .map((c) => ({ id: c.id, name: c.name, color: c.color, amount: round2(Math.abs(Number(c.total))) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // Account groups.
  const cash: AccountBalance[] = [];
  const investments: AccountBalance[] = [];
  const liabilities: AccountBalance[] = [];
  const INVEST_TYPES = new Set(['brokerage', 'retirement', 'roth_ira', 'traditional_ira', '401k', 'roth_401k', 'hsa', 'crypto']);
  for (const a of acctRows) {
    if (!a.isActive) continue;
    const bal = round2(Number(a.balance));
    const row: AccountBalance = { id: a.id, name: a.name, type: a.type, balance: bal };
    if (a.assetClass === 'liability') liabilities.push(row);
    else if (INVEST_TYPES.has(a.type)) investments.push(row);
    else cash.push(row);
  }
  const sumBal = (arr: AccountBalance[]) => round2(arr.reduce((s, r) => s + r.balance, 0));
  const allGroups: AccountGroup[] = [
    { key: 'cash', label: 'Cash', total: sumBal(cash), accounts: cash.sort((a, b) => b.balance - a.balance) },
    { key: 'investments', label: 'Investments', total: sumBal(investments), accounts: investments.sort((a, b) => b.balance - a.balance) },
    { key: 'liabilities', label: 'Liabilities', total: sumBal(liabilities), accounts: liabilities.sort((a, b) => a.balance - b.balance) },
  ];
  const groups = allGroups.filter((g) => g.accounts.length > 0);

  return {
    netWorth,
    nwDelta30: round2(delta30),
    nwSeries,
    monthLabel: new Date(today + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    income,
    spending,
    net,
    topCategories,
    groups,
    reviewCount: reviewRows[0]?.n ?? 0,
  };
}
