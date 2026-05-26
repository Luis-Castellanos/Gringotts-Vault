/**
 * "Key tax numbers" — the figures worth knowing for a given year, grouped and
 * each tied to an IRS (or SSA) source. PORTABLE: pure data, no app imports.
 *
 * Calc-driving figures (brackets, standard deduction, LTCG breakpoints, SS wage
 * base, CTC, NIIT, QBI thresholds) are read from the year tables so there's a
 * single source of truth. The rest — contribution limits, mileage rates,
 * estate/gift, AMT, FEIE — are reference-only and live in EXTRAS below.
 *
 * These are inflation-adjusted annually; verify against the linked source before
 * relying on them. Currency is whole dollars; mileage is cents per mile.
 */

import type { FilingStatus } from './model';
import { yearData, SUPPORTED_YEARS, LATEST_TAX_YEAR } from './data';

export type TaxFact = { label: string; value: string; note?: string };
export type TaxFactGroup = { title: string; source: { label: string; url: string }; facts: TaxFact[] };
export type TaxFactsYear = {
  year: number;
  supported: number[];
  groups: TaxFactGroup[];
  /** Ordinary brackets per filing status, for the page's bracket table. */
  brackets: Record<FilingStatus, { rate: number; upTo: number }[]>;
};

type Extras = {
  retirement: { deferral401k: number; catchup50: number; catchup60to63: number; total415c: number; ira: number; iraCatchup: number; simple: number; simpleCatchup: number };
  hsa: { self: number; family: number; catchup55: number; hdhpDeductibleSelf: number; hdhpDeductibleFamily: number; hdhpOopSelf: number; hdhpOopFamily: number };
  fsa: { health: number; carryover: number };
  ss: { employeeRate: number; medicareRate: number; maxMonthlyBenefitFra: number; cola: number };
  ctcRefundable: number;
  estateGift: { annualExclusion: number; lifetimeExemption: number };
  mileage: { business: number; medicalMoving: number; charitable: number };
  foreignEarnedIncomeExclusion: number;
  saltCap: number;
};

const EXTRAS: Record<number, Extras> = {
  2025: {
    retirement: { deferral401k: 23_500, catchup50: 7_500, catchup60to63: 11_250, total415c: 70_000, ira: 7_000, iraCatchup: 1_000, simple: 16_500, simpleCatchup: 3_500 },
    hsa: { self: 4_300, family: 8_550, catchup55: 1_000, hdhpDeductibleSelf: 1_650, hdhpDeductibleFamily: 3_300, hdhpOopSelf: 8_300, hdhpOopFamily: 16_600 },
    fsa: { health: 3_300, carryover: 660 },
    ss: { employeeRate: 6.2, medicareRate: 1.45, maxMonthlyBenefitFra: 4_018, cola: 2.5 },
    ctcRefundable: 1_700,
    estateGift: { annualExclusion: 19_000, lifetimeExemption: 13_990_000 },
    mileage: { business: 70, medicalMoving: 21, charitable: 14 },
    foreignEarnedIncomeExclusion: 130_000,
    saltCap: 10_000,
  },
  2024: {
    retirement: { deferral401k: 23_000, catchup50: 7_500, catchup60to63: 7_500, total415c: 69_000, ira: 7_000, iraCatchup: 1_000, simple: 16_000, simpleCatchup: 3_500 },
    hsa: { self: 4_150, family: 8_300, catchup55: 1_000, hdhpDeductibleSelf: 1_600, hdhpDeductibleFamily: 3_200, hdhpOopSelf: 8_050, hdhpOopFamily: 16_100 },
    fsa: { health: 3_200, carryover: 640 },
    ss: { employeeRate: 6.2, medicareRate: 1.45, maxMonthlyBenefitFra: 3_822, cola: 3.2 },
    ctcRefundable: 1_700,
    estateGift: { annualExclusion: 18_000, lifetimeExemption: 13_610_000 },
    mileage: { business: 67, medicalMoving: 21, charitable: 14 },
    foreignEarnedIncomeExclusion: 126_500,
    saltCap: 10_000,
  },
};

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const pct = (n: number) => `${n}%`;
const cents = (n: number) => `${n}¢/mi`;

/** IRS annual-inflation news release for the year (covers brackets, std ded, AMT, FEIE, gift, estate). */
const INFLATION_URL: Record<number, string> = {
  2025: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025',
  2024: 'https://www.irs.gov/newsroom/irs-provides-tax-inflation-adjustments-for-tax-year-2024',
};
const RETIREMENT_URL: Record<number, string> = {
  2025: 'https://www.irs.gov/newsroom/401k-limit-increases-to-23500-for-2025-ira-limit-remains-7000',
  2024: 'https://www.irs.gov/newsroom/401k-limit-increases-to-23000-for-2024-ira-limit-rises-to-7000',
};
const MILEAGE_URL: Record<number, string> = {
  2025: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2025',
  2024: 'https://www.irs.gov/newsroom/irs-issues-standard-mileage-rates-for-2024',
};

/** Assemble the key-figures view for a year (falls back to the latest supported). */
export function taxFacts(year: number): TaxFactsYear {
  const y = SUPPORTED_YEARS.includes(year) ? year : LATEST_TAX_YEAR;
  const d = yearData(y);
  const x = EXTRAS[y] ?? EXTRAS[LATEST_TAX_YEAR]!;
  const inflationSrc = { label: `IRS inflation adjustments · ${y}`, url: INFLATION_URL[y] ?? INFLATION_URL[LATEST_TAX_YEAR]! };

  const groups: TaxFactGroup[] = [
    {
      title: 'Standard deduction',
      source: inflationSrc,
      facts: [
        { label: 'Single', value: usd(d.standardDeduction.single) },
        { label: 'Married filing jointly', value: usd(d.standardDeduction.mfj) },
        { label: 'Married filing separately', value: usd(d.standardDeduction.mfs) },
        { label: 'Head of household', value: usd(d.standardDeduction.hoh) },
      ],
    },
    {
      title: 'Long-term capital gains & qualified dividends',
      source: { label: 'IRS Topic 409', url: 'https://www.irs.gov/taxtopics/tc409' },
      facts: [
        { label: 'Rate brackets', value: '0% · 15% · 20%' },
        { label: '0% rate up to (Single)', value: usd(d.ltcg.single.zeroUpTo), note: 'taxable income' },
        { label: '0% rate up to (MFJ)', value: usd(d.ltcg.mfj.zeroUpTo) },
        { label: '15% rate up to (Single)', value: usd(d.ltcg.single.fifteenUpTo), note: '20% above' },
        { label: '15% rate up to (MFJ)', value: usd(d.ltcg.mfj.fifteenUpTo) },
        { label: 'Net capital-loss deduction', value: usd(3_000), note: '$1,500 MFS; excess carries forward' },
      ],
    },
    {
      title: 'Retirement contributions',
      source: { label: `IRS retirement plan limits · ${y}`, url: RETIREMENT_URL[y] ?? RETIREMENT_URL[LATEST_TAX_YEAR]! },
      facts: [
        { label: '401(k)/403(b)/457 elective deferral', value: usd(x.retirement.deferral401k) },
        { label: 'Catch-up (age 50+)', value: usd(x.retirement.catchup50) },
        { label: 'Catch-up (age 60–63)', value: usd(x.retirement.catchup60to63), note: 'SECURE 2.0 higher catch-up' },
        { label: 'Total defined-contribution limit', value: usd(x.retirement.total415c), note: '§415(c) — employee + employer' },
        { label: 'IRA contribution', value: usd(x.retirement.ira) },
        { label: 'IRA catch-up (age 50+)', value: usd(x.retirement.iraCatchup) },
        { label: 'SIMPLE IRA deferral', value: usd(x.retirement.simple), note: `+ ${usd(x.retirement.simpleCatchup)} catch-up` },
      ],
    },
    {
      title: 'HSA & FSA',
      source: { label: 'IRS Publication 969', url: 'https://www.irs.gov/publications/p969' },
      facts: [
        { label: 'HSA contribution — self-only', value: usd(x.hsa.self) },
        { label: 'HSA contribution — family', value: usd(x.hsa.family) },
        { label: 'HSA catch-up (age 55+)', value: usd(x.hsa.catchup55) },
        { label: 'HDHP min. deductible', value: `${usd(x.hsa.hdhpDeductibleSelf)} / ${usd(x.hsa.hdhpDeductibleFamily)}`, note: 'self / family' },
        { label: 'HDHP max out-of-pocket', value: `${usd(x.hsa.hdhpOopSelf)} / ${usd(x.hsa.hdhpOopFamily)}`, note: 'self / family' },
        { label: 'Health FSA salary reduction', value: usd(x.fsa.health), note: `${usd(x.fsa.carryover)} carryover allowed` },
      ],
    },
    {
      title: 'Social Security & Medicare',
      source: { label: 'SSA cost-of-living data', url: 'https://www.ssa.gov/oact/cola/cbb.html' },
      facts: [
        { label: 'Social Security wage base', value: usd(d.ssWageBase), note: 'max taxed earnings' },
        { label: 'Social Security tax rate', value: `${pct(x.ss.employeeRate)} employee`, note: `${pct(x.ss.employeeRate * 2)} self-employed` },
        { label: 'Medicare tax rate', value: `${pct(x.ss.medicareRate)} employee`, note: `${pct(x.ss.medicareRate * 2)} self-employed` },
        { label: 'Additional Medicare tax', value: pct(d.additionalMedicare.rate * 100), note: `over ${usd(d.additionalMedicare.threshold.single)} / ${usd(d.additionalMedicare.threshold.mfj)} (S / MFJ)` },
        { label: 'Max monthly benefit (at FRA)', value: usd(x.ss.maxMonthlyBenefitFra) },
        { label: 'COLA increase', value: pct(x.ss.cola) },
      ],
    },
    {
      title: 'Net investment income tax (NIIT)',
      source: { label: 'IRS — Net Investment Income Tax', url: 'https://www.irs.gov/individuals/net-investment-income-tax' },
      facts: [
        { label: 'Rate', value: pct(d.niit.rate * 100) },
        { label: 'MAGI threshold (Single / HOH)', value: usd(d.niit.threshold.single) },
        { label: 'MAGI threshold (MFJ)', value: usd(d.niit.threshold.mfj) },
        { label: 'MAGI threshold (MFS)', value: usd(d.niit.threshold.mfs) },
      ],
    },
    {
      title: 'Child Tax Credit & dependents',
      source: { label: 'IRS — Child Tax Credit', url: 'https://www.irs.gov/credits-deductions/individuals/child-tax-credit' },
      facts: [
        { label: 'Credit per qualifying child', value: usd(d.ctc.perChild), note: 'under age 17' },
        { label: 'Refundable portion (ACTC)', value: usd(x.ctcRefundable) },
        { label: 'Credit for other dependents', value: usd(d.ctc.perOtherDependent) },
        { label: 'Phaseout starts (Single)', value: usd(d.ctc.phaseoutStart.single) },
        { label: 'Phaseout starts (MFJ)', value: usd(d.ctc.phaseoutStart.mfj) },
      ],
    },
    {
      title: 'Qualified Business Income (§199A)',
      source: { label: 'IRS — QBI deduction', url: 'https://www.irs.gov/newsroom/qualified-business-income-deduction' },
      facts: [
        { label: 'Deduction rate', value: pct(d.qbi.rate * 100), note: 'of qualified business income' },
        { label: 'Income threshold (Single)', value: usd(d.qbi.threshold.single), note: 'SSTB & wage limits phase in above' },
        { label: 'Income threshold (MFJ)', value: usd(d.qbi.threshold.mfj) },
        { label: 'Phase-in range', value: `${usd(d.qbi.phaseInRange.single)} / ${usd(d.qbi.phaseInRange.mfj)}`, note: 'Single / MFJ' },
      ],
    },
    {
      title: 'Standard mileage rates',
      source: { label: `IRS standard mileage rates · ${y}`, url: MILEAGE_URL[y] ?? MILEAGE_URL[LATEST_TAX_YEAR]! },
      facts: [
        { label: 'Business', value: cents(x.mileage.business) },
        { label: 'Medical & moving', value: cents(x.mileage.medicalMoving), note: 'moving: active-duty military only' },
        { label: 'Charitable', value: cents(x.mileage.charitable), note: 'set by statute' },
      ],
    },
    {
      title: 'Estate & gift',
      source: { label: 'IRS — Estate & gift tax', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/estate-tax' },
      facts: [
        { label: 'Annual gift tax exclusion', value: usd(x.estateGift.annualExclusion), note: 'per recipient' },
        { label: 'Lifetime estate/gift exemption', value: usd(x.estateGift.lifetimeExemption) },
      ],
    },
    {
      title: 'Other thresholds',
      source: inflationSrc,
      facts: [
        { label: 'SALT deduction cap', value: usd(x.saltCap), note: 'state & local taxes, itemized' },
        { label: 'AMT exemption (Single)', value: usd(d.amt.exemption.single) },
        { label: 'AMT exemption (MFJ)', value: usd(d.amt.exemption.mfj) },
        { label: 'Foreign earned income exclusion', value: usd(x.foreignEarnedIncomeExclusion) },
        { label: 'Top ordinary rate', value: pct(37), note: 'highest marginal bracket' },
      ],
    },
  ];

  return {
    year: y,
    supported: SUPPORTED_YEARS,
    groups,
    brackets: {
      single: d.ordinaryBrackets.single,
      mfj: d.ordinaryBrackets.mfj,
      mfs: d.ordinaryBrackets.mfs,
      hoh: d.ordinaryBrackets.hoh,
      qw: d.ordinaryBrackets.qw,
    },
  };
}
