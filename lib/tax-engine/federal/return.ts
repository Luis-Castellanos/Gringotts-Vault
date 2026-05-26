import type { TaxReturnInput, TaxReturnResult, TaxLine } from '../model';
import { yearData } from '../data';
import { taxFromBrackets, marginalRate } from './brackets';
import { capitalGainsTax } from './capital-gains';
import { selfEmploymentTax, additionalMedicareTax, niitTax } from './fica';
import { childTaxCredit } from './credits';
import { netCapitalGains, qbiDeduction } from './schedules';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute a federal 1040 estimate. Covers wage/interest/dividend income, the
 * business & investment schedules (C self-employment, D capital gains, E rental
 * + K-1 pass-through), the §199A QBI deduction, the preferential
 * cap-gains/qualified-dividend stack, SE tax, additional Medicare, NIIT,
 * standard-vs-itemized, and the Child Tax Credit. Itemized totals and credits
 * beyond the CTC are passed in.
 */
export function computeFederalReturn(input: TaxReturnInput): TaxReturnResult {
  const data = yearData(input.taxYear);
  const fs = input.filingStatus;
  const brackets = data.ordinaryBrackets[fs];
  const inc = input.income;

  // Schedules ----------------------------------------------------------------
  const scheduleCNet = input.scheduleC.reduce((s, c) => s + c.netProfit, 0);
  const scheduleEOrdinary = input.scheduleE.rentalNet + input.scheduleE.royalties + input.scheduleE.passthroughOrdinary;
  const businessIncome = scheduleCNet + scheduleEOrdinary;
  const capD = netCapitalGains(input.scheduleD, fs);

  const seTax = selfEmploymentTax(scheduleCNet, data);
  const halfSe = seTax * 0.5;

  // Income → AGI -------------------------------------------------------------
  const totalIncome =
    inc.wages +
    inc.taxableInterest +
    inc.ordinaryDividends +
    inc.iraPensionDistributions +
    inc.otherOrdinaryIncome +
    businessIncome +
    capD.includedInIncome;

  const adjustments =
    input.adjustments.hsa + input.adjustments.iraDeduction + input.adjustments.studentLoanInterest + input.adjustments.other + halfSe;
  const agi = totalIncome - adjustments;

  const std = data.standardDeduction[fs];
  const itemized = input.itemizedDeductions ?? 0;
  const useItemized = itemized > std;
  const deduction = useItemized ? itemized : std;
  const taxableBeforeQbi = Math.max(0, agi - deduction);

  // §199A QBI deduction (below the line) -------------------------------------
  const preferentialBeforeCap = Math.max(0, capD.preferentialGain) + Math.max(0, inc.qualifiedDividends);
  const qbi = qbiDeduction({
    scheduleC: input.scheduleC,
    scheduleE: input.scheduleE,
    halfSeTax: halfSe,
    taxableIncomeBeforeQbi: taxableBeforeQbi,
    netCapitalGainAndQualDiv: preferentialBeforeCap,
    status: fs,
    data,
  });
  const taxableIncome = Math.max(0, taxableBeforeQbi - qbi.deduction);

  // Preferential-rate income = qualified dividends + net long-term gains,
  // capped at taxable income. Ordinary slice is the remainder.
  const preferentialIncome = Math.min(taxableIncome, preferentialBeforeCap);
  const ordinaryTaxableIncome = Math.max(0, taxableIncome - preferentialIncome);

  const ordinaryTax = taxFromBrackets(ordinaryTaxableIncome, brackets);
  const capGainsTax = capitalGainsTax(ordinaryTaxableIncome, preferentialIncome, data.ltcg[fs]);
  const incomeTax = ordinaryTax + capGainsTax;

  // Surtaxes -----------------------------------------------------------------
  const additionalMedicare = additionalMedicareTax(inc.wages, scheduleCNet, fs, data);
  const netInvestmentIncome =
    inc.taxableInterest +
    inc.ordinaryDividends +
    Math.max(0, capD.preferentialGain + capD.shortTermOrdinary) +
    input.scheduleE.royalties +
    Math.max(0, input.scheduleE.rentalNet);
  const niit = niitTax(agi, netInvestmentIncome, fs, data);

  const totalTaxBeforeCredits = incomeTax + seTax + additionalMedicare + niit;

  // Non-refundable credits, capped at the income tax (simplified — refundable
  // ACTC and ordering rules come later).
  const ctc = childTaxCredit(input.dependentsUnder17, input.otherDependents, agi, fs, data);
  const totalCredits = Math.min(incomeTax, ctc + input.otherCredits);
  const totalTax = Math.max(0, totalTaxBeforeCredits - totalCredits);

  const payments = input.withholding + input.estimatedPayments;
  const refundOrOwed = payments - totalTax;

  const lines: TaxLine[] = [
    { label: 'Wages, interest & dividends', amount: r2(inc.wages + inc.taxableInterest + inc.ordinaryDividends + inc.iraPensionDistributions + inc.otherOrdinaryIncome) },
    ...(scheduleCNet !== 0 ? [{ label: 'Business income (Schedule C)', amount: r2(scheduleCNet) }] : []),
    ...(scheduleEOrdinary !== 0 ? [{ label: 'Rental, royalty & pass-through (Schedule E)', amount: r2(scheduleEOrdinary) }] : []),
    ...(capD.includedInIncome !== 0
      ? [{ label: 'Capital gain/loss (Schedule D)', amount: r2(capD.includedInIncome), note: capD.lossDeduction < 0 ? 'net loss, limited' : undefined }]
      : []),
    { label: 'Total income', amount: r2(totalIncome) },
    { label: 'Adjustments', amount: -r2(adjustments), note: halfSe > 0 ? `incl. ${r2(halfSe)} ½ SE tax` : undefined },
    { label: 'Adjusted gross income', amount: r2(agi) },
    { label: useItemized ? 'Itemized deduction' : 'Standard deduction', amount: -r2(deduction) },
    ...(qbi.deduction > 0 ? [{ label: 'QBI deduction (§199A)', amount: -r2(qbi.deduction), note: qbi.note }] : []),
    { label: 'Taxable income', amount: r2(taxableIncome) },
    { label: 'Tax (ordinary)', amount: r2(ordinaryTax) },
    ...(capGainsTax > 0 ? [{ label: 'Tax (long-term gains / qual. div.)', amount: r2(capGainsTax) }] : []),
    ...(seTax > 0 ? [{ label: 'Self-employment tax', amount: r2(seTax) }] : []),
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
    businessIncome: r2(businessIncome),
    netCapitalGain: r2(capD.includedInIncome),
    capitalLossDeduction: r2(capD.lossDeduction),
    adjustments: r2(adjustments),
    agi: r2(agi),
    qbiDeduction: r2(qbi.deduction),
    deduction: r2(deduction),
    deductionKind: useItemized ? 'itemized' : 'standard',
    taxableIncome: r2(taxableIncome),
    ordinaryTaxableIncome: r2(ordinaryTaxableIncome),
    preferentialIncome: r2(preferentialIncome),
    ordinaryTax: r2(ordinaryTax),
    capitalGainsTax: r2(capGainsTax),
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
