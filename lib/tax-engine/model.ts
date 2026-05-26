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
  /** Alternative Minimum Tax (Form 6251). 26%/28% rates + the 25% exemption phaseout are statutory constants in amt.ts. */
  amt: {
    exemption: Record<FilingStatus, number>;
    phaseoutStart: Record<FilingStatus, number>;
    rate28Threshold: Record<FilingStatus, number>; // AMT base above which the 28% rate applies
  };
};

// ---------------------------------------------------------------------------
// Schedules (business / investment income that needs its own computation)
// ---------------------------------------------------------------------------

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

/** Schedule A — itemized deductions (the engine applies the medical floor + SALT cap). */
export type ItemizedInput = {
  medicalExpenses: number; // total, before the 7.5%-of-AGI floor
  stateLocalTaxes: number; // SALT (income/sales + property) — capped at $10,000
  mortgageInterest: number;
  investmentInterest: number;
  charitableCash: number;
  charitableNonCash: number;
  casualtyTheft: number;
  otherItemized: number;
};

export type CreditsInput = {
  dependentCareExpenses: number; // Form 2441 qualifying care expenses
  dependentCareQualifyingPersons: number; // caps expenses ($3k for 1, $6k for 2+)
  aotcStudents: number; // students claiming the American Opportunity Credit
  aotcExpenses: number; // total qualified expenses for AOTC
  llcExpenses: number; // expenses for the Lifetime Learning Credit
  energyCredits: number; // residential clean-energy / efficient-home (user-entered total)
  otherCredits: number; // any other non-refundable credits
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
    socialSecurityBenefits: number; // gross SSA-1099 benefits (taxable portion computed)
    unemployment: number; // 1099-G unemployment compensation
    otherOrdinaryIncome: number; // anything else taxed at ordinary rates
  };

  scheduleC: ScheduleCInput[]; // self-employment businesses
  scheduleD: ScheduleDInput; // capital gains/losses
  scheduleE: ScheduleEInput; // rental, royalty & pass-through income

  adjustments: {
    hsa: number;
    iraDeduction: number;
    studentLoanInterest: number;
    educatorExpenses: number;
    seHealthInsurance: number;
    seRetirement: number; // SEP / SIMPLE / solo-401(k) contributions
    other: number; // ½-SE-tax is computed automatically and added on top
  };

  itemized: ItemizedInput | null; // structured itemized; null → standard. Engine uses the larger.
  credits: CreditsInput;

  withholding: number; // federal income tax withheld (W-2 box 2 + 1099 withholding)
  estimatedPayments: number;
  priorYearTax: number; // prior-year total tax — drives the safe-harbor estimate
  priorYearAgiOver150k: boolean; // raises the safe-harbor to 110% of prior-year tax
};

export type TaxLine = { label: string; amount: number; note?: string };
export type Worksheet = { id: string; title: string; note?: string; lines: TaxLine[] };

export type TaxReturnResult = {
  taxYear: number;
  filingStatus: FilingStatus;
  totalIncome: number;
  businessIncome: number; // Schedule C net + Schedule E (rental + royalties + pass-through)
  netCapitalGain: number; // Schedule D amount carried into income (gain, or a limited loss)
  capitalLossDeduction: number; // negative when a net capital loss is deducted (≤ $3,000 / $1,500 MFS)
  taxableSocialSecurity: number; // taxable portion of SS benefits
  adjustments: number;
  agi: number;
  qbiDeduction: number; // §199A deduction (below the line)
  itemizedTotal: number; // Schedule A total (after floor/cap), 0 if not provided
  deduction: number;
  deductionKind: 'standard' | 'itemized';
  taxableIncome: number;
  ordinaryTaxableIncome: number; // taxable income minus preferential-rate gains
  preferentialIncome: number; // qualified dividends + net long-term gains taxed at LTCG rates
  ordinaryTax: number;
  capitalGainsTax: number;
  incomeTax: number; // ordinaryTax + capitalGainsTax
  amtAmount: number; // additional tax from the AMT (0 if regular tax is higher)
  selfEmploymentTax: number;
  additionalMedicareTax: number;
  niitTax: number;
  totalTaxBeforeCredits: number;
  credits: { childTaxCredit: number; dependentCare: number; education: number; energy: number; other: number; total: number };
  totalTax: number;
  payments: number;
  refundOrOwed: number; // payments − totalTax (positive = refund)
  safeHarborTarget: number | null; // payments needed to avoid an underpayment penalty
  effectiveRate: number | null; // totalTax / totalIncome
  marginalRate: number; // ordinary-bracket marginal rate
  lines: TaxLine[]; // 1040-style headline breakdown
  worksheets: Worksheet[]; // supporting work-paper computations
};
