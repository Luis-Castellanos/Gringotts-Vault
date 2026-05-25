/**
 * Forecasting inputs — the starting point for the net-worth/retirement
 * projection. Current net worth (cumulative transaction sum, like the Dashboard)
 * plus trailing-12-month income / expenses / savings, which seed the projection's
 * default contribution and the FI number. The projection math itself is
 * client-side + interactive (lib/forecasting/project.ts).
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

const MS_DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type ForecastInputs = {
  netWorth: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number; // income − expenses (trailing 12 mo)
  hasData: boolean;
};

export async function loadForecastInputs(): Promise<ForecastInputs> {
  const since = new Date(Date.now() - 365 * MS_DAY).toISOString().slice(0, 10);
  const [nwRow, flows] = await Promise.all([
    db.select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text` }).from(transactions),
    db
      .select({ flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`, total: sql<string>`SUM(${transactions.amount})::text` })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, since), eq(transactions.isTransfer, false), eq(transactions.isSplit, false)))
      .groupBy(sql`COALESCE(${categories.flowType}, 'outflow')`),
  ]);

  const netWorth = round2(Number(nwRow[0]?.total ?? 0));
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
    annualIncome,
    annualExpenses,
    annualSavings: round2(annualIncome - annualExpenses),
    hasData: flows.length > 0 || netWorth !== 0,
  };
}
