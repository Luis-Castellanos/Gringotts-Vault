/**
 * Goals loader. Joins each goal to its assigned accounts, derives their balances
 * from transactions, and computes save-up progress/status or pay-down payoff
 * projection (lib/goals/calc.ts). Balances are derived, so goals track the ledger.
 */

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, goalAccounts, goals, transactions } from '@/lib/db/schema';
import { addMonthsToday, payoffMonths, saveUpStatus, type SaveStatus } from './calc';
import type { Debt } from './payoff-scenario';

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type GoalAccountView = { id: string; name: string; amount: number; useEntireBalance: boolean; allocatedAmount: number | null };
export type GoalType = 'save_up' | 'pay_down';
type Link = { accountId: string; useEntireBalance: boolean; allocatedAmount: number | null };

export type GoalView = {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number | null;
  targetDate: string | null;
  monthlyContribution: number | null;
  growthRatePct: number | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  accountIds: string[];
  accounts: GoalAccountView[];
  current: number; // save_up: balance saved · pay_down: total owed
  progressPct: number | null;
  // save_up
  status: SaveStatus | null;
  projectedDate: string | null;
  requiredMonthly: number | null;
  // pay_down
  payoffMonths: number | null;
  debtFreeDate: string | null;
  totalInterest: number | null;
};

type AcctMeta = {
  id: string;
  name: string;
  apr: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  originalPrincipal: number | null;
  balance: number;
};

function buildView(
  g: typeof goals.$inferSelect,
  links: Link[],
  acctMap: Map<string, AcctMeta>,
): GoalView {
  const target = num(g.targetAmount);
  const monthly = num(g.monthlyContribution);
  const growth = num(g.growthRatePct);
  const base = {
    id: g.id,
    name: g.name,
    type: g.type as GoalType,
    targetAmount: target,
    targetDate: g.targetDate,
    monthlyContribution: monthly,
    growthRatePct: growth,
    icon: g.icon,
    color: g.color,
    sortOrder: g.sortOrder,
    accountIds: links.map((l) => l.accountId),
  };

  if (g.type === 'pay_down') {
    let totalOwed = 0;
    let sumOrig = 0;
    let allHaveOrig = links.length > 0;
    let maxMonths = 0;
    let anyMonths = false;
    let totalInterest = 0;
    let anyInterest = false;
    const accountsView: GoalAccountView[] = [];
    for (const l of links) {
      const a = acctMap.get(l.accountId);
      if (!a) continue;
      const owed = Math.max(0, -a.balance);
      totalOwed += owed;
      if (a.originalPrincipal != null) sumOrig += a.originalPrincipal;
      else allHaveOrig = false;
      const rate = a.apr ?? a.interestRate;
      const m = payoffMonths(owed, rate, a.monthlyPayment);
      if (m != null) {
        anyMonths = true;
        maxMonths = Math.max(maxMonths, m);
        if (a.monthlyPayment) {
          totalInterest += a.monthlyPayment * m - owed;
          anyInterest = true;
        }
      }
      accountsView.push({ id: a.id, name: a.name, amount: round2(owed), useEntireBalance: true, allocatedAmount: null });
    }
    return {
      ...base,
      accounts: accountsView,
      current: round2(totalOwed),
      progressPct: allHaveOrig && sumOrig > 0 ? Math.max(0, Math.min(100, ((sumOrig - totalOwed) / sumOrig) * 100)) : null,
      status: null,
      projectedDate: null,
      requiredMonthly: null,
      payoffMonths: anyMonths ? maxMonths : null,
      debtFreeDate: anyMonths ? addMonthsToday(maxMonths) : null,
      totalInterest: anyInterest ? round2(totalInterest) : null,
    };
  }

  // save_up — each linked account contributes its whole balance or a fixed portion.
  let current = 0;
  const accountsView: GoalAccountView[] = [];
  for (const l of links) {
    const a = acctMap.get(l.accountId);
    if (!a) continue;
    const contributing = l.useEntireBalance ? a.balance : l.allocatedAmount ?? 0;
    current += contributing;
    accountsView.push({ id: a.id, name: a.name, amount: round2(contributing), useEntireBalance: l.useEntireBalance, allocatedAmount: l.allocatedAmount });
  }
  const s = saveUpStatus(current, target, g.targetDate, monthly, growth);
  return {
    ...base,
    accounts: accountsView,
    current: round2(current),
    progressPct: target != null && target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : null,
    status: s.status,
    projectedDate: s.projectedDate,
    requiredMonthly: s.requiredMonthly != null ? round2(s.requiredMonthly) : null,
    payoffMonths: null,
    debtFreeDate: null,
    totalInterest: null,
  };
}

export async function loadGoals(): Promise<GoalView[]> {
  const goalRows = await db
    .select()
    .from(goals)
    .where(eq(goals.isArchived, false))
    .orderBy(asc(goals.sortOrder), asc(goals.createdAt));
  if (goalRows.length === 0) return [];

  const links = await db.select().from(goalAccounts);
  const byGoal = new Map<string, Link[]>();
  for (const l of links) {
    const arr = byGoal.get(l.goalId) ?? [];
    arr.push({ accountId: l.accountId, useEntireBalance: l.useEntireBalance, allocatedAmount: num(l.allocatedAmount) });
    byGoal.set(l.goalId, arr);
  }

  const acctIds = [...new Set(links.map((l) => l.accountId))];
  const acctRows = acctIds.length
    ? await db
        .select({
          id: accounts.id,
          name: accounts.displayName,
          apr: accounts.apr,
          interestRate: accounts.interestRate,
          monthlyPayment: accounts.monthlyPayment,
          originalPrincipal: accounts.originalPrincipal,
          balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
        })
        .from(accounts)
        .leftJoin(transactions, eq(transactions.accountId, accounts.id))
        .where(inArray(accounts.id, acctIds))
        .groupBy(accounts.id)
    : [];
  const acctMap = new Map<string, AcctMeta>(
    acctRows.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        apr: num(a.apr),
        interestRate: num(a.interestRate),
        monthlyPayment: num(a.monthlyPayment),
        originalPrincipal: num(a.originalPrincipal),
        balance: Number(a.balance),
      },
    ]),
  );

  return goalRows.map((g) => buildView(g, byGoal.get(g.id) ?? [], acctMap));
}

/** Active debt accounts (balance owed > 0) for the payoff-scenario simulator. */
export async function loadDebts(): Promise<Debt[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.displayName,
      apr: accounts.apr,
      interestRate: accounts.interestRate,
      monthlyPayment: accounts.monthlyPayment,
      balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(and(eq(accounts.assetClass, 'liability'), eq(accounts.isActive, true)))
    .groupBy(accounts.id);
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      balance: Math.max(0, -Number(r.balance)),
      aprPct: num(r.apr) ?? num(r.interestRate),
      minPayment: num(r.monthlyPayment),
    }))
    .filter((d) => d.balance > 0);
}

export type OverAllocatedAccount = { id: string; name: string; balance: number; allocated: number };
export type AllocationOverview = {
  totalAvailable: number; // pool: balances across assignable asset accounts
  totalAllocated: number; // committed to save-up goals
  available: number; // totalAvailable − totalAllocated (negative = over-allocated)
  pctAllocated: number; // 0–100+ (capped display handled in UI)
  overAllocated: OverAllocatedAccount[];
  hasAllocations: boolean;
};

/**
 * Monarch-style "available vs allocated" — how much of your assignable money is
 * committed to save-up goals vs still free to assign. The pool is your active
 * asset (non-liability) accounts; allocation is what each save-up goal claims
 * (entire balance, or a fixed amount). Flags accounts assigned beyond their
 * balance (e.g. the same account claimed whole by two goals).
 */
export async function loadAllocationOverview(): Promise<AllocationOverview> {
  const [acctRows, links] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.displayName,
        balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
      })
      .from(accounts)
      .leftJoin(transactions, eq(transactions.accountId, accounts.id))
      .where(and(eq(accounts.isActive, true), ne(accounts.assetClass, 'liability')))
      .groupBy(accounts.id),
    db
      .select({
        accountId: goalAccounts.accountId,
        useEntire: goalAccounts.useEntireBalance,
        alloc: goalAccounts.allocatedAmount,
      })
      .from(goalAccounts)
      .innerJoin(goals, eq(goals.id, goalAccounts.goalId))
      .where(and(eq(goals.type, 'save_up'), eq(goals.isArchived, false))),
  ]);

  const balById = new Map(acctRows.map((a) => [a.id, { name: a.name, balance: Math.max(0, Number(a.balance)) }]));
  const totalAvailable = acctRows.reduce((s, a) => s + Math.max(0, Number(a.balance)), 0);

  const allocByAcct = new Map<string, number>();
  for (const l of links) {
    const acct = balById.get(l.accountId);
    const amt = l.useEntire ? acct?.balance ?? 0 : Number(l.alloc ?? 0);
    allocByAcct.set(l.accountId, (allocByAcct.get(l.accountId) ?? 0) + amt);
  }

  let totalAllocated = 0;
  const overAllocated: OverAllocatedAccount[] = [];
  for (const [id, allocated] of allocByAcct) {
    totalAllocated += allocated;
    const bal = balById.get(id)?.balance ?? 0;
    if (allocated - bal > 0.01) overAllocated.push({ id, name: balById.get(id)?.name ?? '—', balance: bal, allocated: round2(allocated) });
  }

  return {
    totalAvailable: round2(totalAvailable),
    totalAllocated: round2(totalAllocated),
    available: round2(totalAvailable - totalAllocated),
    pctAllocated: totalAvailable > 0 ? round2((totalAllocated / totalAvailable) * 100) : 0,
    overAllocated,
    hasAllocations: allocByAcct.size > 0,
  };
}

/** Accounts for the goal-assignment picker (id, label, asset class). */
export async function loadGoalAccountOptions(): Promise<{ id: string; label: string; assetClass: string }[]> {
  const rows = await db
    .select({ id: accounts.id, label: accounts.displayName, assetClass: accounts.assetClass })
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(asc(accounts.displayName));
  return rows;
}
