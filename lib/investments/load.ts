/**
 * Investments — a first-pass portfolio view built from transaction history
 * (there's no holdings/cost-basis model yet, so true return/allocation-by-asset
 * are deferred). Covers investment-type accounts: total value + value-over-time
 * series, per-account balances with sparklines, and allocation by account.
 */

import { asc, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
import { getQuotes, DEFAULT_BENCHMARK } from '@/lib/market/quotes';

const INVEST_TYPES = ['brokerage', 'retirement', 'roth_ira', 'traditional_ira', '401k', 'roth_401k', 'hsa', 'crypto'];
const MS_DAY = 86_400_000;
const SPARK_POINTS = 13; // 12 weeks + now
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysAgo = (n: number) => new Date(Date.now() - n * MS_DAY).toISOString().slice(0, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

export type InvAccount = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number;
  share: number; // % of portfolio
  sparkline: number[];
};
export type ValuePoint = { date: string; value: number };
export type Benchmark = { symbol: string; price: number; changePct: number | null };

export type InvestmentsData = {
  totalValue: number;
  delta30: number;
  accounts: InvAccount[];
  series: ValuePoint[];
  benchmark: Benchmark | null;
};

/** Live benchmark quote (S&P 500 proxy). Null when market data isn't configured. */
async function loadBenchmark(): Promise<Benchmark | null> {
  const quotes = await getQuotes([DEFAULT_BENCHMARK]);
  const q = quotes.get(DEFAULT_BENCHMARK);
  return q ? { symbol: q.symbol, price: q.price, changePct: q.changePct } : null;
}

export async function loadInvestments(): Promise<InvestmentsData> {
  const acctRows = await db
    .select({ id: accounts.id, name: accounts.displayName, type: accounts.type, subtype: accounts.accountSubtype })
    .from(accounts)
    .where(inArray(accounts.type, INVEST_TYPES))
    .orderBy(asc(accounts.name));

  if (acctRows.length === 0) {
    return { totalValue: 0, delta30: 0, accounts: [], series: [], benchmark: null };
  }

  const ids = acctRows.map((a) => a.id);
  const benchmarkP = loadBenchmark(); // fire concurrently with the txn aggregation
  const txnRows = await db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      net: sql<string>`SUM(${transactions.amount})::text`,
    })
    .from(transactions)
    .where(inArray(transactions.accountId, ids))
    .groupBy(transactions.accountId, transactions.date)
    .orderBy(asc(transactions.date));

  const byAccount = new Map<string, { date: string; net: number }[]>();
  const dailyTotals = new Map<string, number>();
  for (const r of txnRows) {
    const net = Number(r.net);
    const arr = byAccount.get(r.accountId) ?? [];
    arr.push({ date: r.date, net });
    byAccount.set(r.accountId, arr);
    dailyTotals.set(r.date, (dailyTotals.get(r.date) ?? 0) + net);
  }

  // Total value series (cumulative).
  const today = todayISO();
  const thirtyAgo = daysAgo(30);
  const series: ValuePoint[] = [];
  let running = 0;
  let delta30 = 0;
  for (const d of [...dailyTotals.keys()].sort()) {
    const net = dailyTotals.get(d) ?? 0;
    running += net;
    if (d >= thirtyAgo) delta30 += net;
    series.push({ date: d, value: Math.round(running) });
  }
  if (series.length && series[series.length - 1]!.date < today) {
    series.push({ date: today, value: series[series.length - 1]!.value });
  }
  const totalValue = series.length ? series[series.length - 1]!.value : 0;

  // Sparkline week boundaries.
  const bounds: string[] = [];
  for (let i = SPARK_POINTS - 1; i >= 0; i--) bounds.push(daysAgo(i * 7));

  const invAccounts: InvAccount[] = acctRows.map((a) => {
    const daily = byAccount.get(a.id) ?? [];
    let balance = 0;
    const spark = new Array(SPARK_POINTS).fill(0);
    let cum = 0;
    let bIdx = 0;
    for (const { date, net } of daily) {
      while (bIdx < SPARK_POINTS && date > bounds[bIdx]!) {
        spark[bIdx] = cum;
        bIdx += 1;
      }
      cum += net;
      balance += net;
    }
    while (bIdx < SPARK_POINTS) {
      spark[bIdx] = cum;
      bIdx += 1;
    }
    spark[SPARK_POINTS - 1] = balance;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balance: round2(balance),
      share: 0,
      sparkline: spark.map((v) => Math.round(v)),
    };
  });

  const total = invAccounts.reduce((s, a) => s + a.balance, 0);
  for (const a of invAccounts) a.share = total > 0 ? round2((a.balance / total) * 100) : 0;
  invAccounts.sort((a, b) => b.balance - a.balance);

  return { totalValue, delta30: round2(delta30), accounts: invAccounts, series, benchmark: await benchmarkP };
}
