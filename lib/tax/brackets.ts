/**
 * Federal income-tax rules (brackets + standard deduction), by year and filing
 * status. Pure data + math — no DB — so it's usable on the server loader and the
 * client. This is the "annual rules update" surface: add a year's table each
 * January. Estimates only (ordinary-income brackets; ignores credits, AMT,
 * NIIT, QBI, capital-gains rates, etc.) — a planning aid, not a filed return.
 */

export type FilingStatus = 'single' | 'married' | 'hoh' | 'mfs';
type Bracket = { upTo: number | null; rate: number }; // upTo = top of bracket (null = no cap)

export const FILING_LABEL: Record<FilingStatus, string> = {
  single: 'Single',
  married: 'Married filing jointly',
  hoh: 'Head of household',
  mfs: 'Married filing separately',
};

// Standard deduction by year → filing status.
const STD: Record<number, Record<FilingStatus, number>> = {
  2024: { single: 14_600, married: 29_200, hoh: 21_900, mfs: 14_600 },
  2025: { single: 15_000, married: 30_000, hoh: 22_500, mfs: 15_000 },
};

// Ordinary-income brackets by year → filing status (upTo = inclusive top).
const BRACKETS: Record<number, Record<FilingStatus, Bracket[]>> = {
  2024: {
    single: [
      { upTo: 11_600, rate: 0.1 }, { upTo: 47_150, rate: 0.12 }, { upTo: 100_525, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_725, rate: 0.32 }, { upTo: 609_350, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    married: [
      { upTo: 23_200, rate: 0.1 }, { upTo: 94_300, rate: 0.12 }, { upTo: 201_050, rate: 0.22 },
      { upTo: 383_900, rate: 0.24 }, { upTo: 487_450, rate: 0.32 }, { upTo: 731_200, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    hoh: [
      { upTo: 16_550, rate: 0.1 }, { upTo: 63_100, rate: 0.12 }, { upTo: 100_500, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_700, rate: 0.32 }, { upTo: 609_350, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    mfs: [
      { upTo: 11_600, rate: 0.1 }, { upTo: 47_150, rate: 0.12 }, { upTo: 100_525, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_725, rate: 0.32 }, { upTo: 365_600, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
  },
  2025: {
    single: [
      { upTo: 11_925, rate: 0.1 }, { upTo: 48_475, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_525, rate: 0.32 }, { upTo: 626_350, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    married: [
      { upTo: 23_850, rate: 0.1 }, { upTo: 96_950, rate: 0.12 }, { upTo: 206_700, rate: 0.22 },
      { upTo: 394_600, rate: 0.24 }, { upTo: 501_050, rate: 0.32 }, { upTo: 751_600, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17_000, rate: 0.1 }, { upTo: 64_850, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_500, rate: 0.32 }, { upTo: 626_350, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
    mfs: [
      { upTo: 11_925, rate: 0.1 }, { upTo: 48_475, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_525, rate: 0.32 }, { upTo: 375_800, rate: 0.35 }, { upTo: null, rate: 0.37 },
    ],
  },
};

/** Latest year we have a rules table for (used when a year isn't in the tables). */
export const LATEST_TAX_YEAR = Math.max(...Object.keys(BRACKETS).map(Number));

/** The rules-table year actually applied (the requested year, or the latest available). */
export function bracketsYear(year: number): number {
  return BRACKETS[year] ? year : LATEST_TAX_YEAR;
}
const rulesYear = bracketsYear;

export function standardDeduction(year: number, status: FilingStatus): number {
  return STD[rulesYear(year)]![status];
}

/** Progressive federal tax on taxable income (after deductions). */
export function federalTax(taxableIncome: number, year: number, status: FilingStatus): number {
  if (taxableIncome <= 0) return 0;
  const brackets = BRACKETS[rulesYear(year)]![status];
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const cap = b.upTo ?? Infinity;
    if (taxableIncome <= prev) break;
    const taxedHere = Math.min(taxableIncome, cap) - prev;
    tax += taxedHere * b.rate;
    prev = cap;
  }
  return Math.round(tax);
}

/** Marginal rate (top bracket the income reaches). */
export function marginalRate(taxableIncome: number, year: number, status: FilingStatus): number {
  const brackets = BRACKETS[rulesYear(year)]![status];
  let prev = 0;
  let rate = brackets[0]!.rate;
  for (const b of brackets) {
    if (taxableIncome > prev) rate = b.rate;
    prev = b.upTo ?? Infinity;
  }
  return rate;
}

/** Map a W-4 / paystub filing-status string to our bracket key. */
export function normalizeFilingStatus(raw: string | null | undefined): FilingStatus {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('head')) return 'hoh';
  if (s.includes('separat')) return 'mfs';
  if (s.includes('joint') || s.includes('married') || s.includes('mfj')) return 'married';
  return 'single';
}
