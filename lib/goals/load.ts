/**
 * Goals loader. Joins each goal to its assigned accounts, derives their balances
 * from transactions, and computes save-up progress/status or pay-down payoff
 * projection (lib/goals/calc.ts). Balances are derived, so goals track the ledger.
 */

import { asc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, goalAccounts, goals, transactions } from '@/lib/db/schema';
import { addMonthsToday, payoffMonths, saveUpStatus, type SaveStatus } from './calc';

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

export type GoalAccountView = { id: string; name: string; amount: number };
export type GoalType = 'save_up' | 'pay_down';

export type GoalView = {
  id: string;
  name: string;
  type: GoalType;
  targetAmount: number | null;
  targetDate: string | null;
  monthlyContribution: number | null;
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
  accountIds: string[],
  acctMap: Map<string, AcctMeta>,
): GoalView {
  const accts = accountIds.map((id) => acctMap.get(id)).filter((a): a is AcctMeta => !!a);
  const target = num(g.targetAmount);
  const monthly = num(g.monthlyContribution);
  const base = {
    id: g.id,
    name: g.name,
    type: g.type as GoalType,
    targetAmount: target,
    targetDate: g.targetDate,
    monthlyContribution: monthly,
    icon: g.icon,
    color: g.color,
    sortOrder: g.sortOrder,
    accountIds,
  };

  if (g.type === 'pay_down') {
    let totalOwed = 0;
    let sumOrig = 0;
    let allHaveOrig = accts.length > 0;
    let maxMonths = 0;
    let anyMonths = false;
    let totalInterest = 0;
    let anyInterest = false;
    const accountsView: GoalAccountView[] = [];
    for (const a of accts) {
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
      accountsView.push({ id: a.id, name: a.name, amount: round2(owed) });
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

  // save_up
  let current = 0;
  const accountsView: GoalAccountView[] = [];
  for (const a of accts) {
    current += a.balance;
    accountsView.push({ id: a.id, name: a.name, amount: round2(a.balance) });
  }
  const s = saveUpStatus(current, target, g.targetDate, monthly);
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
  const byGoal = new Map<string, string[]>();
  for (const l of links) {
    const arr = byGoal.get(l.goalId) ?? [];
    arr.push(l.accountId);
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

/** Accounts for the goal-assignment picker (id, label, asset class). */
export async function loadGoalAccountOptions(): Promise<{ id: string; label: string; assetClass: string }[]> {
  const rows = await db
    .select({ id: accounts.id, label: accounts.displayName, assetClass: accounts.assetClass })
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(asc(accounts.displayName));
  return rows;
}
