/**
 * Schedule D netting and the §199A QBI deduction — the bridge between the
 * business/investment schedules and the 1040 income/taxable figures.
 */

import type { FilingStatus, YearData, ScheduleCInput, ScheduleEInput, ScheduleDInput } from '../model';

export type CapitalGainResult = {
  /** Amount carried into total income: the net gain, or a capital-loss deduction (negative). */
  includedInIncome: number;
  /** Net long-term gain taxed at preferential (0/15/20%) rates. */
  preferentialGain: number;
  /** Net short-term gain taxed as ordinary income (0 if there's a net loss). */
  shortTermOrdinary: number;
  /** Negative when a net capital loss is deducted, limited to $3,000 ($1,500 MFS). Excess carries forward (not tracked). */
  lossDeduction: number;
};

/**
 * Combine net short- and long-term capital gains/losses (Schedule D). A net
 * loss is deductible against ordinary income up to $3,000 ($1,500 MFS). For a
 * net gain, the long-term slice (after any short-term loss offsets it) is
 * preferential; the rest is ordinary short-term gain.
 */
export function netCapitalGains(d: ScheduleDInput, status: FilingStatus): CapitalGainResult {
  const total = d.netShortTerm + d.netLongTerm;
  if (total <= 0) {
    const cap = status === 'mfs' ? 1_500 : 3_000;
    const lossDeduction = Math.max(total, -cap);
    return { includedInIncome: lossDeduction, preferentialGain: 0, shortTermOrdinary: 0, lossDeduction };
  }
  const preferentialGain = Math.max(0, Math.min(total, d.netLongTerm));
  const shortTermOrdinary = Math.max(0, total - preferentialGain);
  return { includedInIncome: total, preferentialGain, shortTermOrdinary, lossDeduction: 0 };
}

export type QbiResult = { deduction: number; qualifiedIncome: number; note?: string };

/**
 * §199A Qualified Business Income deduction. 20% of QBI from Schedule C,
 * qualifying rental, and K-1 pass-through income, capped at 20% of taxable
 * income (less net capital gain + qualified dividends). Above the income
 * threshold, specified-service-business (SSTB) income phases out over the
 * statutory range. The W-2-wage / UBIA limit for *non*-SSTB businesses above the
 * threshold is not modeled — flagged in `note` when it would apply.
 */
export function qbiDeduction(args: {
  scheduleC: ScheduleCInput[];
  scheduleE: ScheduleEInput;
  halfSeTax: number;
  taxableIncomeBeforeQbi: number;
  netCapitalGainAndQualDiv: number;
  status: FilingStatus;
  data: YearData;
}): QbiResult {
  const { scheduleC, scheduleE, halfSeTax, taxableIncomeBeforeQbi, netCapitalGainAndQualDiv, status, data } = args;

  // Schedule C QBI, split by SSTB flag, reduced by the ½-SE-tax deduction.
  let cNonSstbGross = 0;
  let cSstbGross = 0;
  for (const c of scheduleC) {
    if (c.netProfit <= 0) continue;
    if (c.isSSTB) cSstbGross += c.netProfit;
    else cNonSstbGross += c.netProfit;
  }
  const cGross = cNonSstbGross + cSstbGross;
  const cAdj = Math.max(0, cGross - halfSeTax);
  const cNonSstb = cGross > 0 ? (cAdj * cNonSstbGross) / cGross : 0;
  const cSstb = cGross > 0 ? (cAdj * cSstbGross) / cGross : 0;

  // Schedule E QBI: positive rental (non-SSTB) + pass-through (per its SSTB flag).
  const eRental = Math.max(0, scheduleE.rentalNet);
  const ePassthrough = Math.max(0, scheduleE.passthroughOrdinary);
  const nonSstbIncome = cNonSstb + eRental + (scheduleE.passthroughIsSSTB ? 0 : ePassthrough);
  const sstbIncome = cSstb + (scheduleE.passthroughIsSSTB ? ePassthrough : 0);

  if (nonSstbIncome + sstbIncome <= 0) return { deduction: 0, qualifiedIncome: 0 };

  const threshold = data.qbi.threshold[status];
  const range = data.qbi.phaseInRange[status];
  let sstbAllowed: number;
  if (taxableIncomeBeforeQbi <= threshold) sstbAllowed = 1;
  else if (taxableIncomeBeforeQbi >= threshold + range) sstbAllowed = 0;
  else sstbAllowed = 1 - (taxableIncomeBeforeQbi - threshold) / range;

  const qualifiedIncome = nonSstbIncome + sstbIncome * sstbAllowed;
  const tentative = data.qbi.rate * qualifiedIncome;
  const overallCap = data.qbi.rate * Math.max(0, taxableIncomeBeforeQbi - Math.max(0, netCapitalGainAndQualDiv));
  const deduction = Math.max(0, Math.min(tentative, overallCap));

  const note =
    taxableIncomeBeforeQbi > threshold && nonSstbIncome > 0
      ? 'W-2 wage / UBIA limit may reduce this above the income threshold (not modeled)'
      : undefined;
  return { deduction, qualifiedIncome, note };
}
