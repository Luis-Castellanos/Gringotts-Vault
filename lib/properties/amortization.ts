/**
 * Amortization schedule for a fixed-rate mortgage, derived from the loan terms
 * stored on the linked `accounts` row (originalPrincipal / interestRate /
 * monthlyPayment / maturityDate / openedAt). Pure functions — no DB.
 *
 * Standard fully-amortizing fixed-rate math:
 *   r = APR / 12 (monthly rate)
 *   payment M = P · r / (1 − (1+r)^−n)          (n = term in months)
 *   interestᵢ = balanceᵢ · r ; principalᵢ = M − interestᵢ
 *
 * We solve for whichever of {term, payment} isn't given, then walk the schedule.
 */

export type AmortInput = {
  principal: number; // original loan amount
  aprPct: number | null; // annual %, e.g. 6.5
  monthlyPayment: number | null; // P&I (may include escrow in reality; treated as P&I here)
  startDate: string | null; // YYYY-MM-DD (loan origination)
  maturityDate: string | null; // YYYY-MM-DD
};

export type AmortRow = {
  index: number; // 1-based payment number
  date: string | null; // YYYY-MM-DD of this payment (null if no startDate)
  payment: number;
  principal: number;
  interest: number;
  balance: number; // remaining balance after this payment
};

export type AmortYear = {
  year: number | null; // calendar year (null if no startDate; falls back to schedule year 1,2,…)
  label: string;
  payment: number;
  principal: number;
  interest: number;
  endBalance: number;
};

export type AmortSchedule = {
  ok: true;
  principal: number;
  aprPct: number;
  termMonths: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  payoffDate: string | null;
  monthsElapsed: number | null; // payments made to date (since startDate)
  currentBalance: number | null; // schedule balance at monthsElapsed
  rows: AmortRow[];
  years: AmortYear[];
};

export type AmortResult = AmortSchedule | { ok: false; reason: string };

function monthsBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00');
  const b = new Date(endISO + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function addMonths(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function amortize(input: AmortInput): AmortResult {
  const P = input.principal;
  if (!P || P <= 0) return { ok: false, reason: 'No original loan amount on the mortgage account.' };
  if (input.aprPct == null) return { ok: false, reason: 'No interest rate on the mortgage account.' };

  const aprPct = input.aprPct;
  const r = aprPct / 100 / 12;

  // Resolve term (months) and payment from whatever the account provides.
  let termMonths: number | null = null;
  if (input.startDate && input.maturityDate) {
    const m = monthsBetween(input.startDate, input.maturityDate);
    if (m > 0) termMonths = m;
  }
  let monthlyPayment = input.monthlyPayment && input.monthlyPayment > 0 ? input.monthlyPayment : null;

  if (termMonths == null && monthlyPayment != null) {
    // Solve term from payment.
    if (r === 0) {
      termMonths = Math.ceil(P / monthlyPayment);
    } else if (monthlyPayment > P * r) {
      termMonths = Math.ceil(-Math.log(1 - (P * r) / monthlyPayment) / Math.log(1 + r));
    } else {
      return { ok: false, reason: 'Monthly payment is too low to cover interest — set a term or a higher payment.' };
    }
  }

  if (termMonths == null) {
    return { ok: false, reason: 'Need a maturity date (with opened date) or a monthly payment to build the schedule.' };
  }

  if (monthlyPayment == null) {
    monthlyPayment = r === 0 ? P / termMonths : (P * r) / (1 - Math.pow(1 + r, -termMonths));
  }

  // Walk the schedule.
  const rows: AmortRow[] = [];
  let balance = P;
  let totalInterest = 0;
  for (let i = 1; i <= termMonths && balance > 0.005; i++) {
    const interest = balance * r;
    let principalPaid = monthlyPayment - interest;
    let payment = monthlyPayment;
    if (principalPaid > balance) {
      // Final payment: only what's left + its interest.
      principalPaid = balance;
      payment = balance + interest;
    }
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    rows.push({
      index: i,
      date: input.startDate ? addMonths(input.startDate, i) : null,
      payment: round2(payment),
      principal: round2(principalPaid),
      interest: round2(interest),
      balance: round2(balance),
    });
  }

  // Yearly rollups.
  const years: AmortYear[] = [];
  let bucket: AmortYear | null = null;
  for (const row of rows) {
    const yr = row.date ? new Date(row.date + 'T00:00:00').getFullYear() : null;
    const key = yr ?? Math.ceil(row.index / 12);
    const label = yr != null ? String(yr) : `Year ${key}`;
    if (!bucket || bucket.label !== label) {
      bucket = { year: yr, label, payment: 0, principal: 0, interest: 0, endBalance: row.balance };
      years.push(bucket);
    }
    bucket.payment = round2(bucket.payment + row.payment);
    bucket.principal = round2(bucket.principal + row.principal);
    bucket.interest = round2(bucket.interest + row.interest);
    bucket.endBalance = row.balance;
  }

  // Position to date.
  let monthsElapsed: number | null = null;
  let currentBalance: number | null = null;
  if (input.startDate) {
    const today = new Date().toISOString().slice(0, 10);
    const m = Math.max(0, monthsBetween(input.startDate, today));
    monthsElapsed = Math.min(m, rows.length);
    currentBalance = monthsElapsed === 0 ? P : (rows[monthsElapsed - 1]?.balance ?? 0);
  }

  return {
    ok: true,
    principal: round2(P),
    aprPct,
    termMonths,
    monthlyPayment: round2(monthlyPayment),
    totalInterest: round2(totalInterest),
    totalPaid: round2(P + totalInterest),
    payoffDate: input.startDate ? addMonths(input.startDate, termMonths) : null,
    monthsElapsed,
    currentBalance: currentBalance == null ? null : round2(currentBalance),
    rows,
    years,
  };
}
