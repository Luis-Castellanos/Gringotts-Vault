/**
 * Forecasting inputs — the starting point for the net-worth/retirement
 * projection. Current net worth (cumulative transaction sum, like the Dashboard)
 * plus trailing-12-month income / expenses / savings, which seed the projection's
 * default contribution and the FI number. The projection math itself is
 * client-side + interactive (lib/forecasting/project.ts).
 */

import { and, asc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { ACCOUNT_TYPES, type AccountTypeGroup } from '@/lib/account-types';

const MS_DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const accountTypeBySlug = new Map(ACCOUNT_TYPES.map((type) => [type.slug, type]));

export type ForecastAccount = {
  id: string;
  name: string;
  institution: string;
  type: string;
  group: AccountTypeGroup | 'other';
  assetClass: 'asset' | 'liability';
  balance: number;
  icon: string;
  color: string | null;
};

export type ForecastInputs = {
  netWorth: number;
  assets: number;
  liabilities: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number; // income − expenses (trailing 12 mo)
  hasData: boolean;
  accounts: ForecastAccount[];
};

export async function loadForecastInputs(): Promise<ForecastInputs> {
  const since = new Date(Date.now() - 365 * MS_DAY).toISOString().slice(0, 10);
  const [nwRow, accountRows, flows] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text` }).from(transactions),
    db
      .select({
        id: accounts.id,
        name: accounts.displayName,
        institution: accounts.institution,
        type: accounts.type,
        assetClass: accounts.assetClass,
        icon: accounts.icon,
        color: accounts.color,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(eq(accounts.isActive, true))
      .groupBy(accounts.id)
      .orderBy(asc(accounts.name)),
    db
      .select({ flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`, total: sql<string>`SUM(${transactions.amount})::text` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, since), eq(transactions.isTransfer, false), eq(transactions.isSplit, false)))
      .groupBy(sql`COALESCE(${categories.flowType}, 'outflow')`),
  ]);

  const netWorth = round2(Number(nwRow[0]?.total ?? 0));
  const forecastAccounts: ForecastAccount[] = accountRows.map((row) => {
    const type = accountTypeBySlug.get(row.type);
    return {
      id: row.id,
      name: row.name,
      institution: row.institution ?? '',
      type: row.type,
      group: type?.group ?? 'other',
      assetClass: row.assetClass,
      balance: round2(Number(row.total ?? 0)),
      icon: row.icon ?? type?.icon ?? '📁',
      color: row.color ?? null,
    };
  });
  let assets = 0;
  let liabilities = 0;
  for (const account of forecastAccounts) {
    if (account.assetClass === 'liability') liabilities += Math.abs(account.balance);
    else assets += account.balance;
  }
  let income = 0;
  let spending = 0;
  for (const r of flows) {
    const v = Number(r.total);
    if (r.flow === 'inflow') income += v;
    else if (r.flow !== 'transfer') spending += v; // outflow stored negative
  }
  const annualIncome = round2(income);
  const annualExpenses = round2(Math.abs(spending));
  return {
    netWorth,
    assets: round2(assets),
    liabilities: round2(liabilities),
    annualIncome,
    annualExpenses,
    annualSavings: round2(annualIncome - annualExpenses),
    hasData: flows.length > 0 || netWorth !== 0,
    accounts: forecastAccounts,
  };
}
