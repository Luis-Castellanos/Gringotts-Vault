import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { AccountsClient, type AccountRow, type NWPoint } from './AccountsClient';
import './accounts.css';

export const metadata = { title: 'Accounts · Vault' };
export const dynamic = 'force-dynamic';

const TODAY = new Date().toISOString().slice(0, 10);
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SPARKLINE_WEEKS = 12;
const SPARKLINE_POINTS = SPARKLINE_WEEKS + 1; // boundaries

function daysAgo(n: number): string {
  return new Date(Date.now() - n * MS_PER_DAY).toISOString().slice(0, 10);
}

export default async function AccountsPage() {
  // 1) All accounts with metadata
  const acctRows = await db.select().from(accounts).orderBy(asc(accounts.name));

  // 2) Per-account, per-date net amount sums. One query fuels:
  //    - per-account current balance
  //    - per-account delta30
  //    - per-account lastActivity
  //    - per-account 12-week sparkline
  //    - global net-worth daily series
  const txnRows = await db
    .select({
      accountId: transactions.accountId,
      date: transactions.date,
      net: sql<string>`SUM(${transactions.amount})::text`,
    })
    .from(transactions)
    .groupBy(transactions.accountId, transactions.date)
    .orderBy(asc(transactions.date));

  // Index daily nets by account
  const byAccount = new Map<string, { date: string; net: number }[]>();
  for (const r of txnRows) {
    const arr = byAccount.get(r.accountId) ?? [];
    arr.push({ date: r.date, net: Number(r.net) });
    byAccount.set(r.accountId, arr);
  }

  // ── NW daily series (cumulative across all accounts) ───────────────────
  const dailyTotals = new Map<string, number>();
  for (const r of txnRows) {
    dailyTotals.set(r.date, (dailyTotals.get(r.date) ?? 0) + Number(r.net));
  }
  const sortedDates = [...dailyTotals.keys()].sort();
  const nwSeries: NWPoint[] = [];
  let nwRunning = 0;
  for (const d of sortedDates) {
    nwRunning += dailyTotals.get(d) ?? 0;
    nwSeries.push({ date: d, value: Math.round(nwRunning) });
  }
  // Ensure today is the last point even if there was no activity today
  if (nwSeries.length > 0 && nwSeries[nwSeries.length - 1]!.date < TODAY) {
    nwSeries.push({ date: TODAY, value: nwSeries[nwSeries.length - 1]!.value });
  }

  // ── Per-account derivations ─────────────────────────────────────────────
  const thirtyAgo = daysAgo(30);
  const weekBoundaries: string[] = []; // 13 ISO dates: oldest → today
  for (let i = SPARKLINE_WEEKS; i >= 0; i--) {
    weekBoundaries.push(daysAgo(i * 7));
  }

  const allRows: AccountRow[] = acctRows.map((a) => {
    const daily = byAccount.get(a.id) ?? [];
    let balance = 0;
    let delta30 = 0;
    let lastActivity: string | null = null;
    const earliestTxnDate = daily.length > 0 ? daily[0]!.date : null;
    for (const { date, net } of daily) {
      balance += net;
      if (date >= thirtyAgo) delta30 += net;
      if (!lastActivity || date > lastActivity) lastActivity = date;
    }
    // Sparkline: cumulative balance at each of 13 week boundaries.
    const sparkline: number[] = new Array(SPARKLINE_POINTS).fill(0);
    let cum = 0;
    let bIdx = 0;
    for (const { date, net } of daily) {
      while (bIdx < SPARKLINE_POINTS && date > weekBoundaries[bIdx]!) {
        sparkline[bIdx] = cum;
        bIdx += 1;
      }
      if (bIdx >= SPARKLINE_POINTS) break;
      cum += net;
    }
    // Fill any remaining boundaries with the final cumulative value.
    while (bIdx < SPARKLINE_POINTS) {
      sparkline[bIdx] = cum;
      bIdx += 1;
    }
    // The last point should always equal the current balance.
    sparkline[SPARKLINE_POINTS - 1] = balance;
    return {
      id: a.id,
      name: a.name,
      displayName: a.displayName,
      type: a.type,
      institution: a.institution ?? '',
      last4: a.accountNumber ?? '',
      isActive: a.isActive,
      openedDate: a.openedAt ?? null,
      closedDate: a.closedAt ?? null,
      earliestTxnDate,
      balance: Math.round(balance * 100) / 100,
      delta30: Math.round(delta30 * 100) / 100,
      lastActivity,
      sparkline: sparkline.map((v) => Math.round(v * 100) / 100),
      creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
      apr: a.apr != null ? Number(a.apr) : null,
    };
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="accounts-page w-full max-w-[1600px] px-12 pt-10 pb-20">
          <AccountsClient accounts={allRows} nwSeries={nwSeries} />
        </main>
      </div>
    </div>
  );
}
