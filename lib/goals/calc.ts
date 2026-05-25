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

export function saveUpStatus(
  current: number,
  target: number | null,
  targetDate: string | null,
  monthly: number | null,
): SaveUpResult {
  if (target != null && current >= target) {
    return { status: 'reached', projectedDate: null, requiredMonthly: null, monthsToTarget: 0 };
  }
  const remaining = target != null ? Math.max(0, target - current) : null;
  const monthsUntil = targetDate ? monthsBetweenToday(targetDate) : null;
  const requiredMonthly = remaining != null && monthsUntil && monthsUntil > 0 ? remaining / monthsUntil : null;

  let projectedDate: string | null = null;
  let monthsAtPace: number | null = null;
  if (remaining != null && monthly && monthly > 0) {
    monthsAtPace = Math.ceil(remaining / monthly);
    projectedDate = addMonthsToday(monthsAtPace);
  }

  let status: SaveStatus = 'no_plan';
  if (requiredMonthly != null && monthly && monthly > 0) {
    if (monthly >= requiredMonthly * 1.05) status = 'ahead';
    else if (monthly >= requiredMonthly * 0.95) status = 'on_track';
    else status = 'at_risk';
  } else if (monthly && monthly > 0) {
    status = 'on_track'; // contributing, no deadline to miss
  }
  return { status, projectedDate, requiredMonthly, monthsToTarget: monthsAtPace };
}
