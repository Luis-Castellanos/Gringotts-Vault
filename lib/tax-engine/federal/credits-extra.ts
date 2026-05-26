/**
 * Non-refundable credits beyond the Child Tax Credit: child & dependent care
 * (Form 2441), and education — American Opportunity + Lifetime Learning
 * (Form 8863). The dollar caps and care-credit rate schedule are statutory
 * constants (not inflation-adjusted), so they live here rather than in YearData.
 */

import type { FilingStatus, CreditsInput, TaxLine } from '../model';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Child & Dependent Care Credit (Form 2441). 20–35% of up to $3,000 / $6,000 of care expenses. */
export function dependentCareCredit(expenses: number, qualifyingPersons: number, agi: number): number {
  if (expenses <= 0 || qualifyingPersons <= 0) return 0;
  const cap = qualifyingPersons >= 2 ? 6_000 : 3_000;
  const eligible = Math.min(expenses, cap);
  // 35% for AGI ≤ $15,000, −1% per $2,000 over, floor 20% above $43,000.
  const steps = Math.floor(Math.max(0, agi - 15_000) / 2_000);
  const rate = Math.max(0.2, 0.35 - steps * 0.01);
  return eligible * rate;
}

/** Phaseout ratio for the education credits (MAGI). Frozen thresholds. */
function educationPhaseout(magi: number, status: FilingStatus): number {
  const joint = status === 'mfj' || status === 'qw';
  const lower = joint ? 160_000 : 80_000;
  const upper = joint ? 180_000 : 90_000;
  if (magi <= lower) return 1;
  if (magi >= upper) return 0;
  return (upper - magi) / (upper - lower);
}

/** American Opportunity + Lifetime Learning (Form 8863). Returns the combined non-refundable amount. */
export function educationCredits(c: CreditsInput, magi: number, status: FilingStatus): number {
  const ratio = educationPhaseout(magi, status);
  if (ratio <= 0) return 0;

  // AOTC: 100% of first $2,000 + 25% of next $2,000 per student, max $2,500 each.
  let aotc = 0;
  if (c.aotcStudents > 0 && c.aotcExpenses > 0) {
    const perStudent = c.aotcExpenses / c.aotcStudents;
    const each = Math.min(2_000, perStudent) + 0.25 * Math.min(2_000, Math.max(0, perStudent - 2_000));
    aotc = each * c.aotcStudents;
  }
  // LLC: 20% of up to $10,000 of expenses (per return).
  const llc = 0.2 * Math.min(10_000, Math.max(0, c.llcExpenses));
  return (aotc + llc) * ratio;
}

export function creditsWorksheet(care: number, education: number, energy: number, ctc: number, other: number): TaxLine[] {
  return [
    ...(ctc > 0 ? [{ label: 'Child Tax Credit + ODC', amount: r2(ctc) }] : []),
    ...(care > 0 ? [{ label: 'Child & dependent care', amount: r2(care) }] : []),
    ...(education > 0 ? [{ label: 'Education (AOTC + LLC)', amount: r2(education) }] : []),
    ...(energy > 0 ? [{ label: 'Residential energy', amount: r2(energy) }] : []),
    ...(other > 0 ? [{ label: 'Other credits', amount: r2(other) }] : []),
  ];
}
