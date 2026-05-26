import type { TaxReturnInput, TaxReturnResult, TaxLine } from '../model';
import { yearData } from '../data';
import { taxFromBrackets, marginalRate } from './brackets';
import { capitalGainsTax } from './capital-gains';
import { selfEmploymentTax, additionalMedicareTax, niitTax } from './fica';
import { childTaxCredit } from './credits';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute a federal 1040 estimate. Covers ordinary income, the preferential
 * cap-gains/qualified-dividend stack, SE tax, additional Medicare, NIIT,
 * standard-vs-itemized, and the Child Tax Credit. Credits beyond the CTC and
 * itemized totals are passed in (T2/T3 will compute more of them).
 */
export function computeFederalReturn(input: TaxReturnInput): TaxReturnResult {
  const data = yearData(input.taxYear);
  const fs = input.filingStatus;
  const brackets = data.ordinaryBrackets[fs];
  const inc = input.income;

  const totalIncome =
    inc.wages + inc.taxableInterest + inc.ordinaryDividends + inc.shortTermGains + inc.longTermGains + inc.selfEmploymentNet + inc.otherOrdinaryIncome;

  const seTax = selfEmploymentTax(inc.selfEmploymentNet, data);
  const halfSe = seTax * 0.5;
  const adjustments = input.adjustments.hsa + input.adjustments.iraDeduction + input.adjustments.studentLoanInterest + input.adjustments.other + halfSe;
  const agi = totalIncome - adjustments;

  const std = data.standardDeduction[fs];
  const itemized = input.itemizedDeductions ?? 0;
  const useItemized = itemized > std;
  const deduction = useItemized ? itemized : std;
  const taxableIncome = Math.max(0, agi - deduction);

  // Preferential-rate income = qualified dividends + net long-term gains (when
  // positive), capped at taxable income. Ordinary slice is the remainder.
  const preferentialIncome = Math.min(taxableIncome, Math.max(0, inc.qualifiedDividends) + Math.max(0, inc.longTermGains));
  const ordinaryTaxableIncome = Math.max(0, taxableIncome - preferentialIncome);

  const ordinaryTax = taxFromBrackets(ordinaryTaxableIncome, brackets);
  const capitalGainsTax2 = capitalGainsTax(ordinaryTaxableIncome, preferentialIncome, data.ltcg[fs]);
  const incomeTax = ordinaryTax + capitalGainsTax2;

  const additionalMedicare = additionalMedicareTax(inc.wages, inc.selfEmploymentNet, fs, data);
  const netInvestmentIncome = inc.taxableInterest + inc.ordinaryDividends + Math.max(0, inc.shortTermGains) + Math.max(0, inc.longTermGains);
  const niit = niitTax(agi, netInvestmentIncome, fs, data);

  const totalTaxBeforeCredits = incomeTax + seTax + additionalMedicare + niit;

  // Non-refundable credits, capped at the income tax (simplified — refundable
  // ACTC and ordering rules come in T2).
  const ctc = childTaxCredit(input.dependentsUnder17, input.otherDependents, agi, fs, data);
  const totalCredits = Math.min(incomeTax, ctc + input.otherCredits);
  const totalTax = Math.max(0, totalTaxBeforeCredits - totalCredits);

  const payments = input.withholding + input.estimatedPayments;
  const refundOrOwed = payments - totalTax;

  const lines: TaxLine[] = [
    { label: 'Total income', amount: r2(totalIncome) },
    { label: 'Adjustments', amount: r2(adjustments), note: halfSe > 0 ? `incl. ${r2(halfSe)} ½ SE tax` : undefined },
    { label: 'Adjusted gross income', amount: r2(agi) },
    { label: useItemized ? 'Itemized deduction' : 'Standard deduction', amount: r2(deduction) },
    { label: 'Taxable income', amount: r2(taxableIncome) },
    { label: 'Tax (ordinary)', amount: r2(ordinaryTax) },
    { label: 'Tax (long-term gains / qual. div.)', amount: r2(capitalGainsTax2) },
    { label: 'Self-employment tax', amount: r2(seTax) },
    ...(additionalMedicare > 0 ? [{ label: 'Additional Medicare tax', amount: r2(additionalMedicare) }] : []),
    ...(niit > 0 ? [{ label: 'Net investment income tax', amount: r2(niit) }] : []),
    { label: 'Credits', amount: -r2(totalCredits), note: ctc > 0 ? `incl. ${r2(ctc)} Child Tax Credit` : undefined },
    { label: 'Total tax', amount: r2(totalTax) },
    { label: 'Payments & withholding', amount: r2(payments) },
    { label: refundOrOwed >= 0 ? 'Estimated refund' : 'Estimated balance due', amount: r2(Math.abs(refundOrOwed)) },
  ];

  return {
    taxYear: data.year,
    filingStatus: fs,
    totalIncome: r2(totalIncome),
    adjustments: r2(adjustments),
    agi: r2(agi),
    deduction: r2(deduction),
    deductionKind: useItemized ? 'itemized' : 'standard',
    taxableIncome: r2(taxableIncome),
    ordinaryTaxableIncome: r2(ordinaryTaxableIncome),
    preferentialIncome: r2(preferentialIncome),
    ordinaryTax: r2(ordinaryTax),
    capitalGainsTax: r2(capitalGainsTax2),
    incomeTax: r2(incomeTax),
    selfEmploymentTax: r2(seTax),
    additionalMedicareTax: r2(additionalMedicare),
    niitTax: r2(niit),
    totalTaxBeforeCredits: r2(totalTaxBeforeCredits),
    childTaxCredit: r2(ctc),
    otherCredits: r2(input.otherCredits),
    totalCredits: r2(totalCredits),
    totalTax: r2(totalTax),
    payments: r2(payments),
    refundOrOwed: r2(refundOrOwed),
    effectiveRate: totalIncome > 0 ? Math.round((totalTax / totalIncome) * 1000) / 10 : null,
    marginalRate: marginalRate(ordinaryTaxableIncome, brackets),
    lines,
  };
}
