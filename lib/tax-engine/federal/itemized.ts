/**
 * Schedule A — itemized deductions. Applies the two limits the form imposes:
 * the 7.5%-of-AGI medical floor and the $10,000 SALT cap ($5,000 MFS).
 */

import type { FilingStatus, ItemizedInput, TaxLine } from '../model';

const MEDICAL_FLOOR = 0.075;
const SALT_CAP = 10_000;
const SALT_CAP_MFS = 5_000;

export type ItemizedResult = { total: number; medicalDeductible: number; saltDeducted: number; lines: TaxLine[] };

export function computeItemized(it: ItemizedInput, agi: number, status: FilingStatus): ItemizedResult {
  const medicalDeductible = Math.max(0, it.medicalExpenses - MEDICAL_FLOOR * Math.max(0, agi));
  const cap = status === 'mfs' ? SALT_CAP_MFS : SALT_CAP;
  const saltDeducted = Math.min(it.stateLocalTaxes, cap);
  const charitable = it.charitableCash + it.charitableNonCash;
  const total = medicalDeductible + saltDeducted + it.mortgageInterest + it.investmentInterest + charitable + it.casualtyTheft + it.otherItemized;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const lines: TaxLine[] = [
    { label: 'Medical & dental', amount: r2(medicalDeductible), note: it.medicalExpenses > 0 ? `${r2(it.medicalExpenses)} less ${(MEDICAL_FLOOR * 100).toFixed(1)}%-of-AGI floor` : undefined },
    { label: 'State & local taxes (SALT)', amount: r2(saltDeducted), note: it.stateLocalTaxes > cap ? `capped at ${cap.toLocaleString()}` : undefined },
    { label: 'Home mortgage interest', amount: r2(it.mortgageInterest) },
    ...(it.investmentInterest > 0 ? [{ label: 'Investment interest', amount: r2(it.investmentInterest) }] : []),
    { label: 'Charitable contributions', amount: r2(charitable) },
    ...(it.casualtyTheft > 0 ? [{ label: 'Casualty & theft losses', amount: r2(it.casualtyTheft) }] : []),
    ...(it.otherItemized > 0 ? [{ label: 'Other itemized', amount: r2(it.otherItemized) }] : []),
    { label: 'Total itemized', amount: r2(total) },
  ];
  return { total, medicalDeductible, saltDeducted, lines };
}
