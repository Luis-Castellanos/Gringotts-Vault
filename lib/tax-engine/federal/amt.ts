/**
 * Alternative Minimum Tax (Form 6251) — simplified. AMTI starts from taxable
 * income and adds back the deductions the AMT disallows (the standard deduction
 * if taken, or the SALT itemized deduction). The exemption phases out at 25¢ per
 * dollar over the threshold; the AMT base is taxed 26%/28%, while preferential
 * (long-term) income keeps its capital-gains rate. AMT is the excess of the
 * tentative minimum tax over the regular income tax.
 *
 * Not modeled: ISO bargain element, depreciation/depletion adjustments, private-
 * activity-bond interest, and other preference items (pass them via `otherPreferences`).
 */

import type { FilingStatus, YearData, TaxLine } from '../model';

const RATE_26 = 0.26;
const RATE_28 = 0.28;
const PHASEOUT_RATE = 0.25;

export type AmtResult = { amount: number; tentativeMinimumTax: number; amti: number; exemption: number; lines: TaxLine[] };

export function computeAmt(args: {
  taxableIncome: number;
  deduction: number;
  deductionKind: 'standard' | 'itemized';
  saltDeducted: number;
  preferentialIncome: number;
  capitalGainsTax: number;
  incomeTax: number;
  otherPreferences: number;
  status: FilingStatus;
  data: YearData;
}): AmtResult {
  const { taxableIncome, deduction, deductionKind, saltDeducted, preferentialIncome, capitalGainsTax, incomeTax, otherPreferences, status, data } = args;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const addBack = deductionKind === 'standard' ? deduction : saltDeducted;
  const amti = Math.max(0, taxableIncome + addBack + otherPreferences);

  let exemption = data.amt.exemption[status];
  const over = Math.max(0, amti - data.amt.phaseoutStart[status]);
  exemption = Math.max(0, exemption - PHASEOUT_RATE * over);

  const amtBase = Math.max(0, amti - exemption);
  const ordinaryBase = Math.max(0, amtBase - preferentialIncome);
  const threshold = data.amt.rate28Threshold[status];
  const tmtOrdinary = ordinaryBase <= threshold ? ordinaryBase * RATE_26 : threshold * RATE_26 + (ordinaryBase - threshold) * RATE_28;
  const tentativeMinimumTax = tmtOrdinary + capitalGainsTax; // preferential income taxed at the same cap-gains rate
  const amount = Math.max(0, tentativeMinimumTax - incomeTax);

  const lines: TaxLine[] = [
    { label: 'Taxable income', amount: r2(taxableIncome) },
    { label: deductionKind === 'standard' ? '+ Standard deduction (not allowed for AMT)' : '+ SALT deduction (not allowed for AMT)', amount: r2(addBack) },
    ...(otherPreferences > 0 ? [{ label: '+ Other AMT preferences', amount: r2(otherPreferences) }] : []),
    { label: 'Alternative minimum taxable income', amount: r2(amti) },
    { label: 'AMT exemption', amount: -r2(exemption), note: over > 0 ? 'phased out' : undefined },
    { label: 'Tentative minimum tax', amount: r2(tentativeMinimumTax) },
    { label: 'Regular income tax', amount: -r2(incomeTax) },
    { label: 'AMT owed', amount: r2(amount) },
  ];
  return { amount, tentativeMinimumTax, amti, exemption, lines };
}
