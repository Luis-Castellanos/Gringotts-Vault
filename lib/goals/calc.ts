/**
 * Goal math — pure functions. Save-up: on-track/ahead/at-risk vs a target +
 * date + monthly contribution. Pay-down: months to payoff from balance + APR +
 * payment (standard amortization solve-for-term).
 */

export type SaveStatus = 'reached' | 'ahead' | 'on_track' | 'at_risk' | 'no_plan';

function monthsBetweenToday(targetISO: string): number {
  const a = new Date();
  const b = new Date(targetISO + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function addMonthsToday(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Months to pay a debt to zero. null = never (payment ≤ interest) or no payment. */
export function payoffMonths(balance: number, aprPct: number | null, payment: number | null): number | null {
  if (balance <= 0) return 0;
  if (!payment || payment <= 0) return null;
  const r = (aprPct ?? 0) / 100 / 12;
  if (r === 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return null; // doesn't cover interest → never pays off
  return Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
}

export type SaveUpResult = {
  status: SaveStatus;
  projectedDate: string | null;
  requiredMonthly: number | null;
  monthsToTarget: number | null;
};

// Accounts for an optional annual growth rate (compounded monthly) on the
// balance + contributions — Monarch's "growth rate" on save-up goals.
export function saveUpStatus(
  current: number,
  target: number | null,
  targetDate: string | null,
  monthly: number | null,
  growthRatePct: number | null = null,
): SaveUpResult {
  if (target != null && current >= target) {
    return { status: 'reached', projectedDate: null, requiredMonthly: null, monthsToTarget: 0 };
  }
  const r = (growthRatePct ?? 0) / 100 / 12;
  const C = current;
  const P = monthly && monthly > 0 ? monthly : 0;
  const monthsUntil = targetDate ? monthsBetweenToday(targetDate) : null;

  // Months to reach the target at the current pace (FV of balance + contributions).
  let monthsAtPace: number | null = null;
  if (target != null && (P > 0 || (r > 0 && C > 0))) {
    if (r === 0) {
      monthsAtPace = P > 0 ? Math.ceil((target - C) / P) : null;
    } else {
      const k = P / r;
      const ratio = (target + k) / (C + k);
      monthsAtPace = ratio > 0 ? Math.ceil(Math.log(ratio) / Math.log(1 + r)) : null;
    }
    if (monthsAtPace != null && (!Number.isFinite(monthsAtPace) || monthsAtPace < 0)) monthsAtPace = null;
  }
  const projectedDate = monthsAtPace != null ? addMonthsToday(monthsAtPace) : null;

  // Monthly contribution needed to hit the target date (solving FV = target).
  let requiredMonthly: number | null = null;
  if (target != null && monthsUntil && monthsUntil > 0) {
    if (r === 0) {
      requiredMonthly = Math.max(0, (target - C) / monthsUntil);
    } else {
      const g = Math.pow(1 + r, monthsUntil);
      requiredMonthly = Math.max(0, ((target - C * g) * r) / (g - 1));
    }
  }

  let status: SaveStatus = 'no_plan';
  if (requiredMonthly != null && monthly != null) {
    if (monthly >= requiredMonthly * 1.05) status = 'ahead';
    else if (monthly >= requiredMonthly * 0.95) status = 'on_track';
    else status = 'at_risk';
  } else if (monthly && monthly > 0) {
    status = 'on_track';
  }
  return { status, projectedDate, requiredMonthly, monthsToTarget: monthsAtPace };
}
