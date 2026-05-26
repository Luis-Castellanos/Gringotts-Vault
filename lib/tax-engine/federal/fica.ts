import type { FilingStatus, YearData } from '../model';

/** Self-employment tax: 92.35% of SE net, 12.4% Social Security (to wage base) + 2.9% Medicare. */
export function selfEmploymentTax(seNet: number, data: YearData): number {
  if (seNet <= 0) return 0;
  const base = seNet * 0.9235;
  const social = Math.min(base, data.ssWageBase) * data.seSocialRate;
  const medicare = base * data.seMedicareRate;
  return social + medicare;
}

/** Additional Medicare tax (0.9%) on wages + SE base over the filing-status threshold. */
export function additionalMedicareTax(wages: number, seNet: number, status: FilingStatus, data: YearData): number {
  const seBase = seNet > 0 ? seNet * 0.9235 : 0;
  const over = Math.max(0, wages + seBase - data.additionalMedicare.threshold[status]);
  return over * data.additionalMedicare.rate;
}

/** Net Investment Income Tax (3.8%) on the lesser of NII and (MAGI − threshold). */
export function niitTax(agi: number, netInvestmentIncome: number, status: FilingStatus, data: YearData): number {
  if (netInvestmentIncome <= 0) return 0;
  const over = Math.max(0, agi - data.niit.threshold[status]);
  return Math.min(netInvestmentIncome, over) * data.niit.rate;
}
