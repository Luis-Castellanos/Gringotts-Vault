/**
 * Life-event scenarios — preset "what happens to my taxes if I…" templates
 * (buy a house, buy a car, have a kid, sell a home, start a side business, get
 * married). PORTABLE: pure functions. Each event takes a few friendly params and
 * returns a modified TaxReturnInput plus plain-language notes. Composes on top of
 * the granular levers, so the Plan page reuses the same compare/visuals.
 */

import type { TaxReturnInput, ItemizedInput } from './model';

export type EventParamKind = 'money' | 'int' | 'pct' | 'toggle';
export type LifeEventParam = { key: string; label: string; kind: EventParamKind; default: number | boolean; note?: string };
export type LifeEvent = {
  id: string;
  label: string;
  icon: string;
  blurb: string;
  params: LifeEventParam[];
  apply: (input: TaxReturnInput, p: Record<string, number | boolean>) => string[]; // mutates input, returns notes
};

const emptyItemized = (): ItemizedInput => ({ medicalExpenses: 0, stateLocalTaxes: 0, mortgageInterest: 0, investmentInterest: 0, charitableCash: 0, charitableNonCash: 0, casualtyTheft: 0, otherItemized: 0 });
const n = (v: number | boolean | undefined, d = 0) => (typeof v === 'number' ? v : d);
const b = (v: number | boolean | undefined) => v === true;
const usd = (x: number) => '$' + Math.round(x).toLocaleString('en-US');

export const LIFE_EVENTS: LifeEvent[] = [
  {
    id: 'buy-home',
    label: 'Buy a home',
    icon: '🏡',
    blurb: 'Mortgage interest + property tax become itemizable — often flipping you from the standard deduction to itemizing.',
    params: [
      { key: 'homePrice', label: 'Home price', kind: 'money', default: 500_000 },
      { key: 'downPaymentPct', label: 'Down payment', kind: 'pct', default: 20 },
      { key: 'mortgageRate', label: 'Mortgage rate', kind: 'pct', default: 6.5 },
      { key: 'propertyTaxAnnual', label: 'Annual property tax', kind: 'money', default: 6_000 },
    ],
    apply(input, p) {
      const price = n(p.homePrice, 0);
      const loan = Math.max(0, price * (1 - n(p.downPaymentPct, 0) / 100));
      const interest = Math.round((loan * n(p.mortgageRate, 0)) / 100);
      const propTax = n(p.propertyTaxAnnual, 0);
      if (!input.itemized) input.itemized = emptyItemized();
      input.itemized.mortgageInterest += interest;
      input.itemized.stateLocalTaxes += propTax;
      return [
        `Loan ≈ ${usd(loan)} → first-year mortgage interest ≈ ${usd(interest)} (itemizable).`,
        `Property tax ${usd(propTax)} adds to SALT — note the $10,000 SALT cap.`,
        'If your itemized total now beats the standard deduction, the engine switches automatically.',
      ];
    },
  },
  {
    id: 'buy-car',
    label: 'Buy a car',
    icon: '🚗',
    blurb: 'A personal car has no federal income-tax effect — unless it’s an EV, which can earn the Clean Vehicle Credit.',
    params: [
      { key: 'price', label: 'Purchase price', kind: 'money', default: 35_000 },
      { key: 'isEV', label: 'Electric vehicle', kind: 'toggle', default: false },
    ],
    apply(input, p) {
      if (b(p.isEV)) {
        input.credits.otherCredits += 7_500;
        return [
          'Clean Vehicle Credit: up to $7,500 (non-refundable — it can only offset tax you owe).',
          'Eligibility caps: MAGI $300k MFJ / $150k single·HOH, and price $55k cars / $80k SUVs & trucks.',
        ];
      }
      return [
        'A personal (non-business) vehicle purchase has no federal income-tax effect — auto-loan interest and the car itself aren’t deductible.',
        'Toggle “Electric vehicle” to model the up-to-$7,500 Clean Vehicle Credit.',
      ];
    },
  },
  {
    id: 'new-child',
    label: 'New child',
    icon: '👶',
    blurb: 'Adds the Child Tax Credit, and child-care costs can earn the Dependent Care Credit.',
    params: [
      { key: 'children', label: 'Children added', kind: 'int', default: 1 },
      { key: 'childcare', label: 'Annual child-care cost', kind: 'money', default: 0 },
    ],
    apply(input, p) {
      const kids = Math.max(0, Math.round(n(p.children, 1)));
      input.dependentsUnder17 += kids;
      const care = n(p.childcare, 0);
      const notes = [`+${kids} qualifying child → up to ${usd(2_000 * kids)} Child Tax Credit (phases out above $400k MFJ / $200k other).`];
      if (care > 0) {
        input.credits.dependentCareExpenses += care;
        input.credits.dependentCareQualifyingPersons += kids;
        notes.push(`Child-care of ${usd(care)} → Dependent Care Credit (20–35% of up to $3k for one child, $6k for two+).`);
      }
      return notes;
    },
  },
  {
    id: 'sell-home',
    label: 'Sell a home',
    icon: '🏠',
    blurb: 'Gain on a primary home is excluded up to $250k ($500k MFJ) under §121; the rest is a long-term capital gain.',
    params: [
      { key: 'salePrice', label: 'Sale price', kind: 'money', default: 700_000 },
      { key: 'costBasis', label: 'Original cost + improvements', kind: 'money', default: 400_000 },
      { key: 'primaryResidence', label: 'Primary residence (2 of last 5 yrs)', kind: 'toggle', default: true },
    ],
    apply(input, p) {
      const gain = Math.max(0, n(p.salePrice, 0) - n(p.costBasis, 0));
      const joint = input.filingStatus === 'mfj' || input.filingStatus === 'qw';
      const exclusion = b(p.primaryResidence) ? (joint ? 500_000 : 250_000) : 0;
      const excluded = Math.min(gain, exclusion);
      const taxable = Math.max(0, gain - exclusion);
      input.scheduleD.netLongTerm += taxable;
      return [
        `Gain ${usd(gain)} — §121 excludes ${usd(excluded)}${exclusion ? '' : ' (not a qualifying primary residence)'}.`,
        `${usd(taxable)} is taxable as a long-term capital gain (0/15/20%), and may trigger the 3.8% NIIT at higher income.`,
      ];
    },
  },
  {
    id: 'side-business',
    label: 'Start a side business',
    icon: '💼',
    blurb: 'Self-employment income brings SE tax, but also the 20% QBI deduction.',
    params: [
      { key: 'netProfit', label: 'Annual net profit', kind: 'money', default: 25_000 },
      { key: 'isSSTB', label: 'Service business (SSTB)', kind: 'toggle', default: false },
    ],
    apply(input, p) {
      const net = n(p.netProfit, 0);
      input.scheduleC.push({ name: 'Side business', netProfit: net, isSSTB: b(p.isSSTB) });
      return [
        `Net profit ${usd(net)} → ~15.3% self-employment tax (about ${usd(net * 0.9235 * 0.153)}), half of it deductible.`,
        'May qualify for the 20% QBI (§199A) deduction, lowering taxable income.',
      ];
    },
  },
  {
    id: 'get-married',
    label: 'Get married',
    icon: '💍',
    blurb: 'Switches to Married filing jointly — wider brackets and a higher standard deduction.',
    params: [],
    apply(input) {
      const was = input.filingStatus;
      input.filingStatus = 'mfj';
      return [
        `Filing status ${was.toUpperCase()} → MFJ (assumes the same total household income).`,
        'Two earners with similar incomes can see a “marriage penalty”; a single earner usually gets a “marriage bonus.”',
      ];
    },
  },
];

export const LIFE_EVENT_BY_ID = new Map(LIFE_EVENTS.map((e) => [e.id, e]));

/** Apply a life event (by id) to a copy of the input. Returns the new input + notes. */
export function applyLifeEvent(input: TaxReturnInput, eventId: string, params: Record<string, number | boolean>): { input: TaxReturnInput; notes: string[] } {
  const event = LIFE_EVENT_BY_ID.get(eventId);
  if (!event) return { input, notes: [] };
  const next = JSON.parse(JSON.stringify(input)) as TaxReturnInput;
  const merged: Record<string, number | boolean> = {};
  for (const def of event.params) merged[def.key] = params[def.key] ?? def.default;
  const notes = event.apply(next, merged);
  return { input: next, notes };
}
