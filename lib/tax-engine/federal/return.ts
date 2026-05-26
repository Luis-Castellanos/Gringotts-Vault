import type { TaxReturnInput, TaxReturnResult, TaxLine, Worksheet } from '../model';
import { yearData } from '../data';
import { taxFromBrackets, marginalRate } from './brackets';
import { capitalGainsTax } from './capital-gains';
import { selfEmploymentTax, additionalMedicareTax, niitTax } from './fica';
import { childTaxCredit } from './credits';
import { netCapitalGains, qbiDeduction } from './schedules';
import { computeItemized } from './itemized';
import { taxableSocialSecurity } from './social-security';
import { dependentCareCredit, educationCredits, creditsWorksheet } from './credits-extra';
import { computeAmt } from './amt';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute a federal 1040 estimate. Covers wage/interest/dividend income, the
 * taxable portion of Social Security, the business & investment schedules
 * (C self-employment, D capital gains, E rental + K-1), the §199A QBI deduction,
 * the preferential cap-gains/qualified-dividend stack, itemized-vs-standard
 * (Schedule A with the medical floor + SALT cap), AMT, SE tax, additional
 * Medicare, NIIT, the Child Tax Credit, child/dependent-care + education
 * credits, and a safe-harbor estimate.
 *
 * Not modeled: EITC and the Saver's Credit (rarely apply to filers with this
 * mix of income; flagged rather than mis-estimated), passive-loss limits, ISO
 * AMT preferences, and state tax.
 */
export function computeFederalReturn(input: TaxReturnInput): TaxReturnResult {
  const data = yearData(input.taxYear);
  const fs = input.filingStatus;
  const brackets = data.ordinaryBrackets[fs];
  const inc = input.income;
  const worksheets: Worksheet[] = [];

  // Schedules ----------------------------------------------------------------
  const scheduleCNet = input.scheduleC.reduce((s, c) => s + c.netProfit, 0);
  const scheduleEOrdinary = input.scheduleE.rentalNet + input.scheduleE.royalties + input.scheduleE.passthroughOrdinary;
  const businessIncome = scheduleCNet + scheduleEOrdinary;
  const capD = netCapitalGains(input.scheduleD, fs);

  const seTax = selfEmploymentTax(scheduleCNet, data);
  const halfSe = seTax * 0.5;

  // Above-the-line adjustments ----------------------------------------------
  const a = input.adjustments;
  const adjustments = a.hsa + a.iraDeduction + a.studentLoanInterest + a.educatorExpenses + a.seHealthInsurance + a.seRetirement + a.other + halfSe;

  // Income (Social Security taxability needs all *other* income, net of adjustments) -----
  const incomeExclSS =
    inc.wages + inc.taxableInterest + inc.ordinaryDividends + inc.iraPensionDistributions + inc.unemployment + inc.otherOrdinaryIncome + businessIncome + capD.includedInIncome;
  const ssOtherIncome = incomeExclSS - adjustments;
  const ss = taxableSocialSecurity(inc.socialSecurityBenefits, ssOtherIncome, fs);
  const totalIncome = incomeExclSS + ss.taxable;
  const agi = totalIncome - adjustments;

  // Deduction: standard vs itemized -----------------------------------------
  const std = data.standardDeduction[fs];
  const itemized = input.itemized ? computeItemized(input.itemized, agi, fs) : null;
  const itemizedTotal = itemized?.total ?? 0;
  const useItemized = itemizedTotal > std;
  const deduction = useItemized ? itemizedTotal : std;
  const saltDeducted = itemized?.saltDeducted ?? 0;
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

  // Preferential-rate income = qualified dividends + net long-term gains, capped at taxable income.
  const preferentialIncome = Math.min(taxableIncome, preferentialBeforeCap);
  const ordinaryTaxableIncome = Math.max(0, taxableIncome - preferentialIncome);

  const ordinaryTax = taxFromBrackets(ordinaryTaxableIncome, brackets);
  const capGainsTax = capitalGainsTax(ordinaryTaxableIncome, preferentialIncome, data.ltcg[fs]);
  const incomeTax = ordinaryTax + capGainsTax;

  // AMT ----------------------------------------------------------------------
  const amt = computeAmt({
    taxableIncome,
    deduction,
    deductionKind: useItemized ? 'itemized' : 'standard',
    saltDeducted,
    preferentialIncome,
    capitalGainsTax: capGainsTax,
    incomeTax,
    otherPreferences: 0,
    status: fs,
    data,
  });

  // Surtaxes -----------------------------------------------------------------
  const additionalMedicare = additionalMedicareTax(inc.wages, scheduleCNet, fs, data);
  const netInvestmentIncome =
    inc.taxableInterest + inc.ordinaryDividends + Math.max(0, capD.preferentialGain + capD.shortTermOrdinary) + input.scheduleE.royalties + Math.max(0, input.scheduleE.rentalNet);
  const niit = niitTax(agi, netInvestmentIncome, fs, data);

  const totalTaxBeforeCredits = incomeTax + amt.amount + seTax + additionalMedicare + niit;

  // Non-refundable credits (capped at income tax + AMT) ----------------------
  const ctc = childTaxCredit(input.dependentsUnder17, input.otherDependents, agi, fs, data);
  const c = input.credits;
  const care = dependentCareCredit(c.dependentCareExpenses, c.dependentCareQualifyingPersons, agi);
  const education = educationCredits(c, agi, fs);
  const energy = Math.max(0, c.energyCredits);
  const other = Math.max(0, c.otherCredits);
  const creditCeiling = incomeTax + amt.amount;
  const totalCredits = Math.min(creditCeiling, ctc + care + education + energy + other);
  const totalTax = Math.max(0, totalTaxBeforeCredits - totalCredits);

  const payments = input.withholding + input.estimatedPayments;
  const refundOrOwed = payments - totalTax;

  // Safe harbor: the lesser of 90% of this year's tax or 100%/110% of last year's.
  const priorTarget = input.priorYearTax > 0 ? (input.priorYearAgiOver150k ? 1.1 : 1.0) * input.priorYearTax : Infinity;
  const safeHarborTarget = totalTax > 0 ? Math.min(0.9 * totalTax, priorTarget) : 0;

  // Worksheets (work papers) -------------------------------------------------
  worksheets.push({
    id: 'income',
    title: 'Income summary',
    lines: [
      { label: 'Wages (W-2)', amount: r2(inc.wages) },
      { label: 'Taxable interest', amount: r2(inc.taxableInterest) },
      { label: 'Ordinary dividends', amount: r2(inc.ordinaryDividends), note: inc.qualifiedDividends > 0 ? `${r2(inc.qualifiedDividends)} qualified` : undefined },
      { label: 'IRA / pension distributions', amount: r2(inc.iraPensionDistributions) },
      ...(inc.unemployment > 0 ? [{ label: 'Unemployment', amount: r2(inc.unemployment) }] : []),
      ...(inc.socialSecurityBenefits > 0 ? [{ label: 'Social Security (taxable portion)', amount: r2(ss.taxable), note: `of ${r2(inc.socialSecurityBenefits)} gross` }] : []),
      ...(scheduleCNet !== 0 ? [{ label: 'Business income (Schedule C)', amount: r2(scheduleCNet) }] : []),
      ...(scheduleEOrdinary !== 0 ? [{ label: 'Rental / royalty / pass-through (Schedule E)', amount: r2(scheduleEOrdinary) }] : []),
      ...(capD.includedInIncome !== 0 ? [{ label: 'Capital gain/loss (Schedule D)', amount: r2(capD.includedInIncome), note: capD.lossDeduction < 0 ? 'net loss, limited' : undefined }] : []),
      ...(inc.otherOrdinaryIncome > 0 ? [{ label: 'Other income', amount: r2(inc.otherOrdinaryIncome) }] : []),
      { label: 'Total income', amount: r2(totalIncome) },
    ],
  });

  if (inc.socialSecurityBenefits > 0) {
    worksheets.push({
      id: 'social-security',
      title: 'Taxable Social Security',
      note: 'Up to 85% becomes taxable as provisional income rises.',
      lines: [
        { label: 'Gross benefits', amount: r2(inc.socialSecurityBenefits) },
        { label: 'Other income (net of adjustments)', amount: r2(ssOtherIncome) },
        { label: 'Provisional income', amount: r2(ss.provisional), note: 'other income + ½ benefits' },
        { label: 'Taxable benefits', amount: r2(ss.taxable) },
      ],
    });
  }

  if (capD.includedInIncome !== 0) {
    worksheets.push({
      id: 'schedule-d',
      title: 'Capital gains (Schedule D)',
      lines: [
        { label: 'Net short-term', amount: r2(input.scheduleD.netShortTerm), note: 'taxed as ordinary' },
        { label: 'Net long-term', amount: r2(input.scheduleD.netLongTerm), note: 'preferential rate' },
        { label: 'Long-term / preferential gain', amount: r2(capD.preferentialGain) },
        { label: 'Short-term gain (ordinary)', amount: r2(capD.shortTermOrdinary) },
        ...(capD.lossDeduction < 0 ? [{ label: 'Capital-loss deduction', amount: r2(capD.lossDeduction), note: 'limited; excess carries forward' }] : []),
      ],
    });
  }

  if (seTax > 0) {
    worksheets.push({
      id: 'se-tax',
      title: 'Self-employment tax (Schedule SE)',
      lines: [
        { label: 'Net SE earnings', amount: r2(scheduleCNet) },
        { label: 'Net earnings × 92.35%', amount: r2(scheduleCNet * 0.9235) },
        { label: 'SE tax (12.4% SS + 2.9% Medicare)', amount: r2(seTax) },
        { label: '½ SE tax (above-the-line)', amount: -r2(halfSe) },
      ],
    });
  }

  if (qbi.deduction > 0) {
    worksheets.push({
      id: 'qbi',
      title: 'QBI deduction (§199A)',
      note: qbi.note,
      lines: [
        { label: 'Qualified business income', amount: r2(qbi.qualifiedIncome) },
        { label: '20% of QBI', amount: r2(0.2 * qbi.qualifiedIncome) },
        { label: '20% of taxable income (less net cap gain)', amount: r2(0.2 * Math.max(0, taxableBeforeQbi - preferentialBeforeCap)) },
        { label: 'QBI deduction (lesser)', amount: r2(qbi.deduction) },
      ],
    });
  }

  if (itemized) {
    worksheets.push({ id: 'schedule-a', title: 'Itemized deductions (Schedule A)', note: useItemized ? 'Itemizing beats the standard deduction.' : `Standard (${r2(std)}) is larger — using standard.`, lines: itemized.lines });
  }

  worksheets.push({
    id: 'taxable-income',
    title: 'AGI → taxable income',
    lines: [
      { label: 'Total income', amount: r2(totalIncome) },
      { label: 'Adjustments', amount: -r2(adjustments), note: halfSe > 0 ? `incl. ${r2(halfSe)} ½ SE tax` : undefined },
      { label: 'Adjusted gross income', amount: r2(agi) },
      { label: useItemized ? 'Itemized deduction' : 'Standard deduction', amount: -r2(deduction) },
      ...(qbi.deduction > 0 ? [{ label: 'QBI deduction', amount: -r2(qbi.deduction) }] : []),
      { label: 'Taxable income', amount: r2(taxableIncome) },
    ],
  });

  worksheets.push({
    id: 'tax',
    title: 'Tax computation',
    lines: [
      { label: 'Ordinary-rate taxable income', amount: r2(ordinaryTaxableIncome) },
      { label: 'Tax on ordinary income', amount: r2(ordinaryTax) },
      ...(preferentialIncome > 0 ? [{ label: 'Preferential income (LT gains + qual. div.)', amount: r2(preferentialIncome) }] : []),
      ...(capGainsTax > 0 ? [{ label: 'Tax on preferential income (0/15/20%)', amount: r2(capGainsTax) }] : []),
      { label: 'Income tax', amount: r2(incomeTax) },
      { label: 'Marginal ordinary rate', amount: marginalRate(ordinaryTaxableIncome, brackets) * 100, note: '%' },
    ],
  });

  if (amt.amount > 0) {
    worksheets.push({ id: 'amt', title: 'Alternative minimum tax (Form 6251)', note: 'TMT exceeds the regular tax — the difference is owed as AMT.', lines: amt.lines });
  }

  if (seTax > 0 || additionalMedicare > 0 || niit > 0) {
    worksheets.push({
      id: 'other-taxes',
      title: 'Other taxes',
      lines: [
        ...(seTax > 0 ? [{ label: 'Self-employment tax', amount: r2(seTax) }] : []),
        ...(additionalMedicare > 0 ? [{ label: 'Additional Medicare tax (0.9%)', amount: r2(additionalMedicare) }] : []),
        ...(niit > 0 ? [{ label: 'Net investment income tax (3.8%)', amount: r2(niit), note: `on ${r2(netInvestmentIncome)} NII` }] : []),
      ],
    });
  }

  const creditLines = creditsWorksheet(care, education, energy, ctc, other);
  if (creditLines.length > 0) {
    worksheets.push({
      id: 'credits',
      title: 'Credits',
      note: totalCredits < ctc + care + education + energy + other ? 'Capped at the tax liability (non-refundable).' : undefined,
      lines: [...creditLines, { label: 'Total credits applied', amount: -r2(totalCredits) }],
    });
  }

  worksheets.push({
    id: 'payments',
    title: 'Payments & balance',
    lines: [
      { label: 'Total tax', amount: r2(totalTax) },
      { label: 'Withholding', amount: r2(input.withholding) },
      ...(input.estimatedPayments > 0 ? [{ label: 'Estimated payments', amount: r2(input.estimatedPayments) }] : []),
      { label: refundOrOwed >= 0 ? 'Estimated refund' : 'Estimated balance due', amount: r2(Math.abs(refundOrOwed)) },
      ...(safeHarborTarget > 0 ? [{ label: 'Safe-harbor target (avoid penalty)', amount: r2(safeHarborTarget), note: input.priorYearTax > 0 ? 'lesser of 90% this year / prior-year tax' : '90% of this year' }] : []),
    ],
  });

  // Headline 1040 lines ------------------------------------------------------
  const lines: TaxLine[] = [
    { label: 'Total income', amount: r2(totalIncome) },
    { label: 'Adjustments', amount: -r2(adjustments) },
    { label: 'Adjusted gross income', amount: r2(agi) },
    { label: useItemized ? 'Itemized deduction' : 'Standard deduction', amount: -r2(deduction) },
    ...(qbi.deduction > 0 ? [{ label: 'QBI deduction', amount: -r2(qbi.deduction) }] : []),
    { label: 'Taxable income', amount: r2(taxableIncome) },
    { label: 'Income tax', amount: r2(incomeTax) },
    ...(amt.amount > 0 ? [{ label: 'Alternative minimum tax', amount: r2(amt.amount) }] : []),
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
    taxableSocialSecurity: r2(ss.taxable),
    adjustments: r2(adjustments),
    agi: r2(agi),
    qbiDeduction: r2(qbi.deduction),
    itemizedTotal: r2(itemizedTotal),
    deduction: r2(deduction),
    deductionKind: useItemized ? 'itemized' : 'standard',
    taxableIncome: r2(taxableIncome),
    ordinaryTaxableIncome: r2(ordinaryTaxableIncome),
    preferentialIncome: r2(preferentialIncome),
    ordinaryTax: r2(ordinaryTax),
    capitalGainsTax: r2(capGainsTax),
    incomeTax: r2(incomeTax),
    amtAmount: r2(amt.amount),
    selfEmploymentTax: r2(seTax),
    additionalMedicareTax: r2(additionalMedicare),
    niitTax: r2(niit),
    totalTaxBeforeCredits: r2(totalTaxBeforeCredits),
    credits: { childTaxCredit: r2(ctc), dependentCare: r2(care), education: r2(education), energy: r2(energy), other: r2(other), total: r2(totalCredits) },
    totalTax: r2(totalTax),
    payments: r2(payments),
    refundOrOwed: r2(refundOrOwed),
    safeHarborTarget: safeHarborTarget > 0 ? r2(safeHarborTarget) : null,
    effectiveRate: totalIncome > 0 ? Math.round((totalTax / totalIncome) * 1000) / 10 : null,
    marginalRate: marginalRate(ordinaryTaxableIncome, brackets),
    lines,
    worksheets,
  };
}
