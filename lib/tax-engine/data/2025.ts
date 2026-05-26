import type { YearData } from '../model';

// 2025 federal figures (IRS Rev. Proc. 2024-40). qw (qualifying surviving
// spouse) mirrors mfj.
export const YEAR_2025: YearData = {
  year: 2025,
  standardDeduction: { single: 15_000, mfj: 30_000, mfs: 15_000, hoh: 22_500, qw: 30_000 },
  ordinaryBrackets: {
    single: [
      { upTo: 11_925, rate: 0.1 }, { upTo: 48_475, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_525, rate: 0.32 }, { upTo: 626_350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfj: [
      { upTo: 23_850, rate: 0.1 }, { upTo: 96_950, rate: 0.12 }, { upTo: 206_700, rate: 0.22 },
      { upTo: 394_600, rate: 0.24 }, { upTo: 501_050, rate: 0.32 }, { upTo: 751_600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17_000, rate: 0.1 }, { upTo: 64_850, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_500, rate: 0.32 }, { upTo: 626_350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfs: [
      { upTo: 11_925, rate: 0.1 }, { upTo: 48_475, rate: 0.12 }, { upTo: 103_350, rate: 0.22 },
      { upTo: 197_300, rate: 0.24 }, { upTo: 250_525, rate: 0.32 }, { upTo: 375_800, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    qw: [
      { upTo: 23_850, rate: 0.1 }, { upTo: 96_950, rate: 0.12 }, { upTo: 206_700, rate: 0.22 },
      { upTo: 394_600, rate: 0.24 }, { upTo: 501_050, rate: 0.32 }, { upTo: 751_600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
  },
  ltcg: {
    single: { zeroUpTo: 48_350, fifteenUpTo: 533_400 },
    mfj: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
    hoh: { zeroUpTo: 64_750, fifteenUpTo: 566_700 },
    mfs: { zeroUpTo: 48_350, fifteenUpTo: 300_000 },
    qw: { zeroUpTo: 96_700, fifteenUpTo: 600_050 },
  },
  ssWageBase: 176_100,
  seSocialRate: 0.124,
  seMedicareRate: 0.029,
  additionalMedicare: { rate: 0.009, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000, qw: 250_000 } },
  niit: { rate: 0.038, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000, qw: 250_000 } },
  ctc: {
    perChild: 2_000,
    perOtherDependent: 500,
    phaseoutStart: { single: 200_000, mfj: 400_000, mfs: 200_000, hoh: 200_000, qw: 400_000 },
    phaseoutPer1000: 50,
  },
};
