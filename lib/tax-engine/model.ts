/**
 * Tax engine — public types. PORTABLE: this whole folder imports nothing from
 * the rest of the app. Inputs in → computed result out. See
 * docs/tax-engine-roadmap.md.
 */

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qw';

export type Bracket = { upTo: number; rate: number }; // upTo = inclusive top (Infinity for the top bracket)

/** Per-year federal figures. Add a new year = add a data file, never touch calc. */
export type YearData = {
  year: number;
  standardDeduction: Record<FilingStatus, number>;
  ordinaryBrackets: Record<FilingStatus, Bracket[]>;
  /** Long-term cap-gains / qualified-dividend breakpoints: 0% up to zeroUpTo, 15% up to fifteenUpTo, 20% above. */
  ltcg: Record<FilingStatus, { zeroUpTo: number; fifteenUpTo: number }>;
  ssWageBase: number; // Social Security wage base
  seSocialRate: number; // 0.124
  seMedicareRate: number; // 0.029
  additionalMedicare: { rate: number; threshold: Record<FilingStatus, number> }; // 0.9% over threshold
  niit: { rate: number; threshold: Record<FilingStatus, number> }; // 3.8% net investment income tax
  ctc: {
    perChild: number;
    perOtherDependent: number;
    phaseoutStart: Record<FilingStatus, number>;
    phaseoutPer1000: number; // credit lost per $1,000 (or fraction) of MAGI over the start
  };
  /** Qualified Business Income deduction (§199A). 20% of QBI, with the SSTB
   *  income limit phasing in over `phaseInRange` above `threshold`. */
  qbi: {
    rate: number; // 0.20
    threshold: Record<FilingStatus, number>;
    phaseInRange: Record<FilingStatus, number>;
  };
};

/** Schedule C — a sole-proprietor / single-member-LLC business (self-employment). */
export type ScheduleCInput = {
  name?: string;
  netProfit: number; // gross receipts − expenses (Schedule C line 31); may be a loss
  isSSTB?: boolean; // specified service trade/business — caps QBI above the income threshold
};

/** Schedule D — already-netted capital gains/losses (incl. prior-year carryovers). */
export type ScheduleDInput = {
  netShortTerm: number; // net short-term gain/loss (taxed as ordinary income)
  netLongTerm: number; // net long-term gain/loss (taxed at preferential rates)
};

/** Schedule E — rental real estate, royalties, and K-1 pass-through income. */
export type ScheduleEInput = {
  rentalNet: number; // net rental real-estate income/loss (passive-loss limits not modeled)
  royalties: number; // royalty income
  passthroughOrdinary: number; // K-1 ordinary business income (partnership / S-corp box 1)
  passthroughIsSSTB?: boolean; // the pass-through is a specified service business
};

export type TaxReturnInput = {
  taxYear: number;
  filingStatus: FilingStatus;
  dependentsUnder17: number; // qualifying children for the Child Tax Credit
  otherDependents: number; // credit for other dependents

  income: {
    wages: number; // W-2 box 1, total
    taxableInterest: number; // 1099-INT
    ordinaryDividends: number; // 1099-DIV box 1a (includes the qualified portion)
    qualifiedDividends: number; // 1099-DIV box 1b — subset taxed at LTCG rates
    iraPensionDistributions: number; // taxable 1099-R distributions
    otherOrdinaryIncome: number; // anything else taxed at ordinary rates
  };

  scheduleC: ScheduleCInput[]; // self-employment businesses
  scheduleD: ScheduleDInput; // capital gains/losses
  scheduleE: ScheduleEInput; // rental, royalty & pass-through income

  adjustments: {
    hsa: number;
    iraDeduction: number;
    studentLoanInterest: number;
    other: number; // ½-SE-tax is computed automatically and added on top
  };

  itemizedDeductions: number | null; // total itemized; null → standard. Engine uses the larger.
  withholding: number; // federal income tax withheld (W-2 box 2 + 1099 withholding)
  estimatedPayments: number;
  otherCredits: number; // manual non-refundable credits beyond the CTC
};

export type TaxLine = { label: string; amount: number; note?: string };

export type TaxReturnResult = {
  taxYear: number;
  filingStatus: FilingStatus;
  totalIncome: number;
  businessIncome: number; // Schedule C net + Schedule E (rental + royalties + pass-through)
  netCapitalGain: number; // Schedule D amount carried into income (gain, or a limited loss)
  capitalLossDeduction: number; // negative when a net capital loss is deducted (≤ $3,000 / $1,500 MFS)
  adjustments: number;
  agi: number;
  qbiDeduction: number; // §199A deduction (below the line)
  deduction: number;
  deductionKind: 'standard' | 'itemized';
  taxableIncome: number;
  ordinaryTaxableIncome: number; // taxable income minus preferential-rate gains
  preferentialIncome: number; // qualified dividends + net long-term gains taxed at LTCG rates
  ordinaryTax: number;
  capitalGainsTax: number;
  incomeTax: number; // ordinaryTax + capitalGainsTax
  selfEmploymentTax: number;
  additionalMedicareTax: number;
  niitTax: number;
  totalTaxBeforeCredits: number;
  childTaxCredit: number;
  otherCredits: number;
  totalCredits: number;
  totalTax: number;
  payments: number;
  refundOrOwed: number; // payments − totalTax (positive = refund)
  effectiveRate: number | null; // totalTax / totalIncome
  marginalRate: number; // ordinary-bracket marginal rate
  lines: TaxLine[]; // 1040-style worksheet breakdown
};
