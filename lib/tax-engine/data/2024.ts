import type { YearData } from '../model';

// 2024 federal figures (IRS Rev. Proc. 2023-34). qw mirrors mfj.
export const YEAR_2024: YearData = {
  year: 2024,
  standardDeduction: { single: 14_600, mfj: 29_200, mfs: 14_600, hoh: 21_900, qw: 29_200 },
  ordinaryBrackets: {
    single: [
      { upTo: 11_600, rate: 0.1 }, { upTo: 47_150, rate: 0.12 }, { upTo: 100_525, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_725, rate: 0.32 }, { upTo: 609_350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfj: [
      { upTo: 23_200, rate: 0.1 }, { upTo: 94_300, rate: 0.12 }, { upTo: 201_050, rate: 0.22 },
      { upTo: 383_900, rate: 0.24 }, { upTo: 487_450, rate: 0.32 }, { upTo: 731_200, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    hoh: [
      { upTo: 16_550, rate: 0.1 }, { upTo: 63_100, rate: 0.12 }, { upTo: 100_500, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_700, rate: 0.32 }, { upTo: 609_350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfs: [
      { upTo: 11_600, rate: 0.1 }, { upTo: 47_150, rate: 0.12 }, { upTo: 100_525, rate: 0.22 },
      { upTo: 191_950, rate: 0.24 }, { upTo: 243_725, rate: 0.32 }, { upTo: 365_600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    qw: [
      { upTo: 23_200, rate: 0.1 }, { upTo: 94_300, rate: 0.12 }, { upTo: 201_050, rate: 0.22 },
      { upTo: 383_900, rate: 0.24 }, { upTo: 487_450, rate: 0.32 }, { upTo: 731_200, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
  },
  ltcg: {
    single: { zeroUpTo: 47_025, fifteenUpTo: 518_900 },
    mfj: { zeroUpTo: 94_050, fifteenUpTo: 583_750 },
    hoh: { zeroUpTo: 63_000, fifteenUpTo: 551_350 },
    mfs: { zeroUpTo: 47_025, fifteenUpTo: 291_850 },
    qw: { zeroUpTo: 94_050, fifteenUpTo: 583_750 },
  },
  ssWageBase: 168_600,
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
