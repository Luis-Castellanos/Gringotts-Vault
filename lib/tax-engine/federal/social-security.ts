/**
 * Taxable portion of Social Security benefits (the 1040 worksheet). Provisional
 * income = other income + ½ of benefits; up to 50% becomes taxable above the
 * first threshold, up to 85% above the second.
 */

import type { FilingStatus } from '../model';

const THRESHOLDS: Record<'joint' | 'other', { base: number; second: number }> = {
  joint: { base: 32_000, second: 44_000 },
  other: { base: 25_000, second: 34_000 },
};

export type SocialSecurityResult = { taxable: number; provisional: number };

/** otherIncome = all income except SS, net of above-the-line adjustments (+ any tax-exempt interest). */
export function taxableSocialSecurity(benefits: number, otherIncome: number, status: FilingStatus): SocialSecurityResult {
  if (benefits <= 0) return { taxable: 0, provisional: 0 };
  const t = status === 'mfj' || status === 'qw' ? THRESHOLDS.joint : THRESHOLDS.other;
  const provisional = Math.max(0, otherIncome) + 0.5 * benefits;
  if (provisional <= t.base) return { taxable: 0, provisional };

  const firstTier = Math.min(0.5 * benefits, 0.5 * (t.second - t.base));
  if (provisional <= t.second) {
    return { taxable: Math.min(0.5 * benefits, 0.5 * (provisional - t.base)), provisional };
  }
  const taxable = Math.min(0.85 * benefits, 0.85 * (provisional - t.second) + firstTier);
  return { taxable, provisional };
}
