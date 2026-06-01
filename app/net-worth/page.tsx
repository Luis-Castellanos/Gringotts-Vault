import { asc, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
import { loadTaxonomyStyle } from '@/lib/taxonomy-style';
import { AccountsSettingsClient, type AcctRow, type NetWorthPoint } from '../accounts/AccountsSettingsClient';
import '../accounts/accounts-settings.css';

export const metadata = { title: 'Net Worth · Vault' };
export const dynamic = 'force-dynamic';

type BalanceRow = { accountId: string; date: string; balance: string };

function netContribution(balance: number, assetClass: 'asset' | 'liability') {
  return assetClass === 'liability' ? -Math.abs(balance) : Math.max(0, balance);
}

export default async function NetWorthPage() {
  const [acctRows, style, stats, balanceRows] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    loadTaxonomyStyle(),
    db
      .select({
        accountId: transactions.accountId,
        count: sql<number>`count(*)::int`,
        balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
      })
      .from(transactions)
      .groupBy(transactions.accountId),
    db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        balance: sql<string>`${transactions.balance}::text`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(isNotNull(transactions.balance))
      .orderBy(asc(transactions.date)),
  ]);
  const statById = new Map(stats.map((s) => [s.accountId, s]));
  const latestPrintedBalance = new Map<string, number>();
  for (const row of balanceRows as BalanceRow[]) {
    latestPrintedBalance.set(row.accountId, Number(row.balance));
  }

  const rows: AcctRow[] = acctRows.map((a) => {
    const s = statById.get(a.id);
    const printedBalance = latestPrintedBalance.get(a.id);
    return {
      id: a.id,
      name: a.name,
      institution: a.institution ?? '',
      last4: a.accountNumber ?? '',
      type: a.type,
      icon: style.typeIcon[a.type] ?? '📁',
      assetClass: a.assetClass,
      isActive: a.isActive,
      openedDate: a.openedAt ?? null,
      creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
      apr: a.apr != null ? Number(a.apr) : null,
      apy: a.apy != null ? Number(a.apy) : null,
      interestRate: a.interestRate != null ? Number(a.interestRate) : null,
      monthlyPayment: a.monthlyPayment != null ? Number(a.monthlyPayment) : null,
      originalPrincipal: a.originalPrincipal != null ? Number(a.originalPrincipal) : null,
      maturityDate: a.maturityDate ?? null,
      accountSubtype: a.accountSubtype ?? null,
      count: s?.count ?? 0,
      balance: Math.round((printedBalance ?? (s ? Number(s.balance) : 0)) * 100) / 100,
    };
  });

  const activeRows = rows.filter((row) => row.isActive);
  const activeById = new Map(activeRows.map((row) => [row.id, row]));
  const accountsWithPrintedBalance = new Set((balanceRows as BalanceRow[]).map((row) => row.accountId));
  const constantContribution = activeRows
    .filter((account) => !accountsWithPrintedBalance.has(account.id))
    .reduce((sum, account) => sum + netContribution(account.balance, account.assetClass), 0);
  const byDate = new Map<string, BalanceRow[]>();
  for (const row of balanceRows as BalanceRow[]) {
    if (!activeById.has(row.accountId)) continue;
    const items = byDate.get(row.date) ?? [];
    items.push(row);
    byDate.set(row.date, items);
  }

  const latestByAccount = new Map<string, number>();
  const netWorthSeries: NetWorthPoint[] = [];
  for (const date of [...byDate.keys()].sort()) {
    for (const row of byDate.get(date)!) {
      latestByAccount.set(row.accountId, Number(row.balance));
    }
    const value = activeRows.reduce((sum, account) => {
      if (!accountsWithPrintedBalance.has(account.id)) return sum;
      const known = latestByAccount.get(account.id);
      if (known == null) return sum;
      return sum + netContribution(known, account.assetClass);
    }, constantContribution);
    netWorthSeries.push({ date, value: Math.round(value * 100) / 100 });
  }
  const currentNetWorth = activeRows.reduce((sum, account) => sum + netContribution(account.balance, account.assetClass), 0);
  const today = new Date().toISOString().slice(0, 10);
  if (netWorthSeries.length === 0) {
    netWorthSeries.push({ date: today, value: Math.round(currentNetWorth * 100) / 100 });
  } else if (netWorthSeries[netWorthSeries.length - 1]!.date < today) {
    netWorthSeries.push({ date: today, value: Math.round(currentNetWorth * 100) / 100 });
  } else if (netWorthSeries[netWorthSeries.length - 1]!.date === today) {
    netWorthSeries[netWorthSeries.length - 1] = { date: today, value: Math.round(currentNetWorth * 100) / 100 };
  }

  return (
    <main className="acctset-page w-full max-w-[1600px] px-12 pt-8 pb-24">
      <AccountsSettingsClient accounts={rows} netWorthSeries={netWorthSeries} compactCards initialView="grid" />
    </main>
  );
}
