/**
 * Debt-payoff simulator (Monarch-style scenarios). Models paying off multiple
 * debts with the **avalanche** (highest APR first) or **snowball** (smallest
 * balance first) method, plus an optional extra monthly payment and one-time
 * lump sum. Holds total monthly payment constant (= sum of minimums + extra) so
 * a paid-off debt's minimum "rolls over" onto the next — the core debt-snowball
 * mechanic. Pure functions; safe to run client-side for interactive what-ifs.
 */

import { addMonthsToday } from './calc';

export type Method = 'avalanche' | 'snowball';
export type Debt = { id: string; name: string; balance: number; aprPct: number | null; minPayment: number | null };
export type DebtPayoff = { id: string; name: string; months: number | null; interest: number; payoffDate: string | null };
export type ScenarioResult = {
  months: number | null; // months until debt-free (null = infeasible within cap)
  debtFreeDate: string | null;
  totalInterest: number;
  totalPaid: number;
  perDebt: DebtPayoff[];
  feasible: boolean;
};

const CAP = 1200; // 100 years — guards against minimums that never cover interest
const round2 = (n: number) => Math.round(n * 100) / 100;

export function simulatePayoff(
  debts: Debt[],
  opts: { method: Method; extraMonthly?: number; lumpSum?: number },
): ScenarioResult {
  const extra = Math.max(0, opts.extraMonthly ?? 0);
  let lumpLeft = Math.max(0, opts.lumpSum ?? 0);

  const work = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      bal: d.balance,
      r: (d.aprPct ?? 0) / 100 / 12,
      min: Math.max(0, d.minPayment ?? 0),
      interest: 0,
      months: null as number | null,
    }));

  if (work.length === 0) {
    return { months: 0, debtFreeDate: addMonthsToday(0), totalInterest: 0, totalPaid: 0, perDebt: [], feasible: true };
  }

  const startBalance = work.reduce((s, d) => s + d.bal, 0);
  const budget = work.reduce((s, d) => s + d.min, 0) + extra;
  const priority = () =>
    work
      .filter((d) => d.bal > 0.005)
      .sort((a, b) => (opts.method === 'avalanche' ? b.r - a.r : a.bal - b.bal));

  // Lump sum hits the highest-priority debt(s) up front.
  for (const d of priority()) {
    if (lumpLeft <= 0) break;
    const pay = Math.min(lumpLeft, d.bal);
    d.bal -= pay;
    lumpLeft -= pay;
  }
  for (const d of work) if (d.bal <= 0.005 && d.months == null) d.months = 0;

  let month = 0;
  let totalInterest = 0;
  while (work.some((d) => d.bal > 0.005) && month < CAP) {
    month++;
    for (const d of work) {
      if (d.bal > 0.005) {
        const i = d.bal * d.r;
        d.bal += i;
        d.interest += i;
        totalInterest += i;
      }
    }
    let available = budget;
    // Minimums on every open debt.
    for (const d of work) {
      if (d.bal > 0.005) {
        const p = Math.min(d.min, d.bal);
        d.bal -= p;
        available -= p;
      }
    }
    // Leftover (extra + rolled-over minimums) attacks debts in priority order.
    for (const d of priority()) {
      if (available <= 0.005) break;
      const p = Math.min(available, d.bal);
      d.bal -= p;
      available -= p;
    }
    for (const d of work) if (d.bal <= 0.005 && d.months == null) d.months = month;
  }

  const feasible = !work.some((d) => d.bal > 0.005);
  return {
    months: feasible ? month : null,
    debtFreeDate: feasible ? addMonthsToday(month) : null,
    totalInterest: round2(totalInterest),
    totalPaid: round2(startBalance + totalInterest),
    perDebt: work
      .map((d) => ({ id: d.id, name: d.name, months: d.months, interest: round2(d.interest), payoffDate: d.months != null ? addMonthsToday(d.months) : null }))
      .sort((a, b) => (a.months ?? Infinity) - (b.months ?? Infinity)),
    feasible,
  };
}
