/**
 * Real Estate data loaders. A property carries its own market value +
 * acquisition details and optionally links to a mortgage `accounts` row whose
 * loan terms drive the amortization schedule (lib/properties/amortization.ts).
 *
 * Loan balance is best-effort: prefer the amortization schedule's
 * to-date balance (derived from terms), fall back to the transaction-derived
 * balance, then to the original principal. Equity = market value − loan balance.
 */

import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, balanceSnapshots, properties, transactions } from '@/lib/db/schema';
import { amortize, type AmortResult } from './amortization';
import { loadTotalMonthlyRent } from './leases';

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export type MortgageInfo = {
  accountId: string;
  name: string;
  originalPrincipal: number | null;
  aprPct: number | null;
  monthlyPayment: number | null;
  startDate: string | null;
  maturityDate: string | null;
  currentBalance: number;
};

export type PropertyRow = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyType: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  acquisitionDate: string | null;
  acquisitionPrice: number | null;
  landValuePct: number | null;
  marketValue: number | null;
  imageUrl: string | null;
  isActive: boolean;
  soldDate: string | null;
  soldPrice: number | null;
  escrowAccountId: string | null;
  sortOrder: number;
  notes: string | null;
  mortgage: MortgageInfo | null;
  loanBalance: number;
  equity: number;
};

export type Portfolio = {
  properties: PropertyRow[];
  totalMarketValue: number;
  totalEquity: number;
  totalLoanBalance: number;
  totalMonthlyRent: number;
  count: number;
};

export type MortgageAccountOption = {
  id: string;
  label: string;
  hasTerms: boolean;
};

type AcctTerms = {
  id: string;
  name: string;
  originalPrincipal: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  openedAt: string | null;
  maturityDate: string | null;
};

function buildMortgage(a: AcctTerms, txnBalance: number | null, snapshotBalance: number | null): MortgageInfo {
  const sched = amortize({
    principal: a.originalPrincipal ?? 0,
    aprPct: a.interestRate,
    monthlyPayment: a.monthlyPayment,
    startDate: a.openedAt,
    maturityDate: a.maturityDate,
  });
  let currentBalance: number;
  // Most authoritative → least: the statement's stated unpaid principal
  // (balance_snapshots), then the amortization estimate, then any txn-derived
  // balance, then the original principal.
  if (snapshotBalance != null) currentBalance = snapshotBalance;
  else if (sched.ok && sched.currentBalance != null) currentBalance = sched.currentBalance;
  else if (txnBalance != null && txnBalance > 0) currentBalance = txnBalance;
  else currentBalance = a.originalPrincipal ?? 0;
  return {
    accountId: a.id,
    name: a.name,
    originalPrincipal: a.originalPrincipal,
    aprPct: a.interestRate,
    monthlyPayment: a.monthlyPayment,
    startDate: a.openedAt,
    maturityDate: a.maturityDate,
    currentBalance,
  };
}

async function loadMortgageMaps(ids: string[]): Promise<{
  terms: Map<string, AcctTerms>;
  txnBalance: Map<string, number>;
  snapshot: Map<string, number>;
}> {
  if (ids.length === 0) return { terms: new Map(), txnBalance: new Map(), snapshot: new Map() };
  const [acctRows, txnRows, snapRows] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.displayName,
        originalPrincipal: accounts.originalPrincipal,
        interestRate: accounts.interestRate,
        monthlyPayment: accounts.monthlyPayment,
        openedAt: accounts.openedAt,
        maturityDate: accounts.maturityDate,
      })
      .from(accounts)
      .where(inArray(accounts.id, ids)),
    db
      .select({
        accountId: transactions.accountId,
        bal: sql<string>`COALESCE(-SUM(${transactions.amount}), 0)::text`,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, ids))
      .groupBy(transactions.accountId),
    // Latest stated unpaid-principal snapshot per account (from mortgage statements).
    db
      .select({ accountId: balanceSnapshots.accountId, balance: balanceSnapshots.balance, asOf: balanceSnapshots.asOfDate })
      .from(balanceSnapshots)
      .where(inArray(balanceSnapshots.accountId, ids))
      .orderBy(desc(balanceSnapshots.asOfDate)),
  ]);
  const terms = new Map<string, AcctTerms>(
    acctRows.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        originalPrincipal: num(a.originalPrincipal),
        interestRate: num(a.interestRate),
        monthlyPayment: num(a.monthlyPayment),
        openedAt: a.openedAt,
        maturityDate: a.maturityDate,
      },
    ]),
  );
  const txnBalance = new Map<string, number>(txnRows.map((t) => [t.accountId, Number(t.bal)]));
  const snapshot = new Map<string, number>();
  for (const r of snapRows) if (!snapshot.has(r.accountId)) snapshot.set(r.accountId, Number(r.balance)); // first = latest (desc)
  return { terms, txnBalance, snapshot };
}

export async function loadPortfolio(): Promise<Portfolio> {
  const rows = await db
    .select()
    .from(properties)
    .orderBy(asc(properties.sortOrder), asc(properties.name));

  const mortgageIds = [...new Set(rows.map((r) => r.mortgageAccountId).filter((x): x is string => !!x))];
  const { terms, txnBalance, snapshot } = await loadMortgageMaps(mortgageIds);

  const out: PropertyRow[] = rows.map((r) => {
    const t = r.mortgageAccountId ? terms.get(r.mortgageAccountId) : undefined;
    const mortgage = t ? buildMortgage(t, txnBalance.get(t.id) ?? null, snapshot.get(t.id) ?? null) : null;
    const loanBalance = mortgage?.currentBalance ?? 0;
    const value = num(r.marketValue) ?? num(r.acquisitionPrice) ?? 0;
    return {
      id: r.id,
      name: r.name,
      street: r.street,
      city: r.city,
      state: r.state,
      zip: r.zip,
      propertyType: r.propertyType,
      beds: r.beds,
      baths: num(r.baths),
      sqft: r.sqft,
      acquisitionDate: r.acquisitionDate,
      acquisitionPrice: num(r.acquisitionPrice),
      landValuePct: num(r.landValuePct),
      marketValue: num(r.marketValue),
      imageUrl: r.imageUrl,
      isActive: r.isActive,
      soldDate: r.soldDate,
      soldPrice: num(r.soldPrice),
      escrowAccountId: r.escrowAccountId,
      sortOrder: r.sortOrder,
      notes: r.notes,
      mortgage,
      loanBalance,
      equity: Math.round((value - loanBalance) * 100) / 100,
    };
  });

  const active = out.filter((p) => p.isActive);
  const totalMonthlyRent = await loadTotalMonthlyRent();
  return {
    properties: out,
    totalMarketValue: active.reduce((s, p) => s + (p.marketValue ?? p.acquisitionPrice ?? 0), 0),
    totalEquity: active.reduce((s, p) => s + p.equity, 0),
    totalLoanBalance: active.reduce((s, p) => s + p.loanBalance, 0),
    totalMonthlyRent,
    count: active.length,
  };
}

export async function loadProperty(
  id: string,
): Promise<{ property: PropertyRow; schedule: AmortResult | null } | null> {
  const [row] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!row) return null;

  const mortgageIds = row.mortgageAccountId ? [row.mortgageAccountId] : [];
  const { terms, txnBalance, snapshot } = await loadMortgageMaps(mortgageIds);
  const t = row.mortgageAccountId ? terms.get(row.mortgageAccountId) : undefined;
  const mortgage = t ? buildMortgage(t, txnBalance.get(t.id) ?? null, snapshot.get(t.id) ?? null) : null;
  const loanBalance = mortgage?.currentBalance ?? 0;
  const value = num(row.marketValue) ?? num(row.acquisitionPrice) ?? 0;

  const schedule: AmortResult | null = t
    ? amortize({
        principal: t.originalPrincipal ?? 0,
        aprPct: t.interestRate,
        monthlyPayment: t.monthlyPayment,
        startDate: t.openedAt,
        maturityDate: t.maturityDate,
      })
    : null;

  const property: PropertyRow = {
    id: row.id,
    name: row.name,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    propertyType: row.propertyType,
    beds: row.beds,
    baths: num(row.baths),
    sqft: row.sqft,
    acquisitionDate: row.acquisitionDate,
    acquisitionPrice: num(row.acquisitionPrice),
    landValuePct: num(row.landValuePct),
    marketValue: num(row.marketValue),
    imageUrl: row.imageUrl,
    isActive: row.isActive,
    soldDate: row.soldDate,
    soldPrice: num(row.soldPrice),
    escrowAccountId: row.escrowAccountId,
    sortOrder: row.sortOrder,
    notes: row.notes,
    mortgage,
    loanBalance,
    equity: Math.round((value - loanBalance) * 100) / 100,
  };
  return { property, schedule };
}

/** Liability accounts (mortgages/loans, excluding credit cards) for the link picker. */
export async function loadMortgageAccountOptions(): Promise<MortgageAccountOption[]> {
  const rows = await db
    .select({
      id: accounts.id,
      label: accounts.displayName,
      principal: accounts.originalPrincipal,
      rate: accounts.interestRate,
    })
    .from(accounts)
    .where(and(eq(accounts.assetClass, 'liability'), ne(accounts.type, 'credit_card')))
    .orderBy(asc(accounts.displayName));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    hasTerms: r.principal != null && r.rate != null,
  }));
}
