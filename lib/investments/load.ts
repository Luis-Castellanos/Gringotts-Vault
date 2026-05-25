/**
 * Investments — a first-pass portfolio view built from transaction history
 * (there's no holdings/cost-basis model yet, so true return/allocation-by-asset
 * are deferred). Covers investment-type accounts: total value + value-over-time
 * series, per-account balances with sparklines, and allocation by account.
 */

import { asc, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, holdings, transactions } from '@/lib/db/schema';
import { getQuotes, DEFAULT_BENCHMARK } from '@/lib/market/quotes';

const INVEST_TYPES = ['brokerage', 'retirement', 'roth_ira', 'traditional_ira', '401k', 'roth_401k', 'hsa', 'crypto'];
const MS_DAY = 86_400_000;
const SPARK_POINTS = 13; // 12 weeks + now
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (v == null ? null : Number(v));
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

export type HoldingView = {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string | null;
  name: string;
  assetClass: string;
  quantity: number | null;
  costBasis: number | null;
  price: number | null;
  marketValue: number;
  gain: number | null;
  gainPct: number | null;
  live: boolean; // market value used a live quote (vs. statement value)
  asOf: string | null;
};
export type AssetAllocation = { assetClass: string; value: number; share: number };

export type Holdings = {
  rows: HoldingView[];
  totalValue: number;
  totalCost: number;
  totalGain: number;
  allocation: AssetAllocation[];
  anyLive: boolean;
};

export type InvestmentsData = {
  totalValue: number;
  delta30: number;
  accounts: InvAccount[];
  series: ValuePoint[];
  benchmark: Benchmark | null;
  holdings: Holdings;
};

const EMPTY_HOLDINGS: Holdings = { rows: [], totalValue: 0, totalCost: 0, totalGain: 0, allocation: [], anyLive: false };

/**
 * Current holdings for the given investment accounts, enriched with live quotes
 * (lib/market/quotes) for market value + gain/loss, falling back to the
 * statement-reported value when there's no live price. Returns empty until the
 * brokerage-statement parser populates the `holdings` table — at which point the
 * Investments page's holdings view lights up automatically.
 */
async function loadHoldings(accountIds: string[], nameById: Map<string, string>): Promise<Holdings> {
  if (accountIds.length === 0) return EMPTY_HOLDINGS;
  const rows = await db
    .select()
    .from(holdings)
    .where(inArray(holdings.accountId, accountIds));
  if (rows.length === 0) return EMPTY_HOLDINGS;

  // Keep the latest position per (account, symbol|name) by as_of.
  const latest = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const key = `${r.accountId}|${r.symbol ?? r.name}`;
    const cur = latest.get(key);
    if (!cur || (r.asOf ?? '') > (cur.asOf ?? '')) latest.set(key, r);
  }
  const positions = [...latest.values()];

  const symbols = [...new Set(positions.map((p) => p.symbol).filter((s): s is string => !!s))];
  const quotes = await getQuotes(symbols);

  const out: HoldingView[] = positions.map((p) => {
    const quantity = num(p.quantity);
    const costBasis = num(p.costBasis);
    const q = p.symbol ? quotes.get(p.symbol) : undefined;
    const live = !!q;
    const price = q?.price ?? num(p.statementPrice);
    const marketValue =
      quantity != null && price != null ? round2(quantity * price) : num(p.statementValue) ?? 0;
    const gain = costBasis != null ? round2(marketValue - costBasis) : null;
    const gainPct = gain != null && costBasis ? round2((gain / costBasis) * 100) : null;
    return {
      id: p.id,
      accountId: p.accountId,
      accountName: nameById.get(p.accountId) ?? 'Account',
      symbol: p.symbol,
      name: p.name,
      assetClass: p.assetClass,
      quantity,
      costBasis,
      price,
      marketValue,
      gain,
      gainPct,
      live,
      asOf: p.asOf,
    };
  });
  out.sort((a, b) => b.marketValue - a.marketValue);

  const totalValue = round2(out.reduce((s, h) => s + h.marketValue, 0));
  const totalCost = round2(out.reduce((s, h) => s + (h.costBasis ?? 0), 0));
  const byClass = new Map<string, number>();
  for (const h of out) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.marketValue);
  const allocation: AssetAllocation[] = [...byClass.entries()]
    .map(([assetClass, value]) => ({ assetClass, value: round2(value), share: totalValue > 0 ? round2((value / totalValue) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    rows: out,
    totalValue,
    totalCost,
    totalGain: round2(totalValue - totalCost),
    allocation,
    anyLive: out.some((h) => h.live),
  };
}

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
    return { totalValue: 0, delta30: 0, accounts: [], series: [], benchmark: null, holdings: EMPTY_HOLDINGS };
  }

  const ids = acctRows.map((a) => a.id);
  const nameById = new Map(acctRows.map((a) => [a.id, a.name]));
  const benchmarkP = loadBenchmark(); // fire concurrently with the txn aggregation
  const holdingsP = loadHoldings(ids, nameById);
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

  return { totalValue, delta30: round2(delta30), accounts: invAccounts, series, benchmark: await benchmarkP, holdings: await holdingsP };
}
