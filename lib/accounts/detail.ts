/**
 * Per-account detail loaders — the account record plus a derived daily balance
 * series (cumulative sum of signed transaction amounts, matching how balances
 * are derived everywhere else in Vault). Powers /accounts/[id].
 */

import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';

export type AccountDetail = {
  id: string;
  name: string;
  displayName: string;
  institution: string;
  last4: string;
  type: string;
  assetClass: string;
  isActive: boolean;
  openedAt: string | null;
  closedAt: string | null;
  creditLimit: number | null;
  apr: number | null;
  apy: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  originalPrincipal: number | null;
  maturityDate: string | null;
  accountSubtype: string | null;
};

export type BalancePoint = { date: string; balance: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | null) => (v != null ? Number(v) : null);

export async function loadAccountDetail(id: string): Promise<AccountDetail | null> {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName,
    institution: a.institution ?? '',
    last4: a.accountNumber ?? '',
    type: a.type,
    assetClass: a.assetClass,
    isActive: a.isActive,
    openedAt: a.openedAt ?? null,
    closedAt: a.closedAt ?? null,
    creditLimit: num(a.creditLimit),
    apr: num(a.apr),
    apy: num(a.apy),
    interestRate: num(a.interestRate),
    monthlyPayment: num(a.monthlyPayment),
    originalPrincipal: num(a.originalPrincipal),
    maturityDate: a.maturityDate ?? null,
    accountSubtype: a.accountSubtype ?? null,
  };
}

/** End-of-day cumulative balance for every day the account had activity. */
export async function loadAccountBalanceSeries(id: string): Promise<BalancePoint[]> {
  const rows = await db
    .select({ date: transactions.date, net: sql<string>`SUM(${transactions.amount})::text` })
    .from(transactions)
    .where(eq(transactions.accountId, id))
    .groupBy(transactions.date)
    .orderBy(asc(transactions.date));

  let bal = 0;
  const out: BalancePoint[] = [];
  for (const r of rows) {
    bal += Number(r.net);
    out.push({ date: r.date, balance: r2(bal) });
  }
  return out;
}
