/**
 * Scenario planning — layer "what-if" levers on a baseline return and surface
 * the cascading consequences. PORTABLE: pure functions, no app imports. The UI
 * recomputes baseline vs scenario live as levers move.
 */

import type { TaxReturnInput, TaxReturnResult, FilingStatus, Bracket } from './model';
import { computeFederalReturn } from './federal/return';
import { yearData } from './data';

export type ScenarioLevers = {
  additionalOrdinaryIncome: number; // extra ordinary income (bonus, interest, a side W-2…)
  rothConversion: number; // traditional → Roth: adds taxable distribution income
  additionalLongTermGains: number; // realize LT gains (or harvest losses if negative)
  additionalShortTermGains: number; // realize ST gains (or losses if negative)
  preTaxRetirement: number; // additional traditional 401(k)/IRA — reduces AGI
  additionalHsa: number; // additional HSA contribution — reduces AGI
  additionalCharitable: number; // additional charitable giving (itemized)
  filingStatus: FilingStatus | null; // filing-status what-if (null = keep baseline)
};

/** A named, saved scenario (levers + optional life event) — for side-by-side comparison. */
export type SavedScenario = { id: string; name: string; levers: ScenarioLevers; event?: { id: string; params: Record<string, number | boolean> } | null };

export function emptyLevers(): ScenarioLevers {
  return {
    additionalOrdinaryIncome: 0,
    rothConversion: 0,
    additionalLongTermGains: 0,
    additionalShortTermGains: 0,
    preTaxRetirement: 0,
    additionalHsa: 0,
    additionalCharitable: 0,
    filingStatus: null,
  };
}

export function leversActive(l: ScenarioLevers): boolean {
  return (
    l.additionalOrdinaryIncome !== 0 ||
    l.rothConversion !== 0 ||
    l.additionalLongTermGains !== 0 ||
    l.additionalShortTermGains !== 0 ||
    l.preTaxRetirement !== 0 ||
    l.additionalHsa !== 0 ||
    l.additionalCharitable !== 0 ||
    l.filingStatus !== null
  );
}

/** Apply levers to a baseline engine input, returning a new (independent) input. */
export function applyLevers(base: TaxReturnInput, l: ScenarioLevers): TaxReturnInput {
  const input = JSON.parse(JSON.stringify(base)) as TaxReturnInput;
  if (l.filingStatus) input.filingStatus = l.filingStatus;
  input.income.otherOrdinaryIncome += l.additionalOrdinaryIncome;
  input.income.iraPensionDistributions += l.rothConversion;
  input.scheduleD.netLongTerm += l.additionalLongTermGains;
  input.scheduleD.netShortTerm += l.additionalShortTermGains;
  input.adjustments.iraDeduction += l.preTaxRetirement;
  input.adjustments.hsa += l.additionalHsa;
  if (l.additionalCharitable !== 0) {
    if (!input.itemized) input.itemized = { medicalExpenses: 0, stateLocalTaxes: 0, mortgageInterest: 0, investmentInterest: 0, charitableCash: 0, charitableNonCash: 0, casualtyTheft: 0, otherItemized: 0 };
    input.itemized.charitableCash += l.additionalCharitable;
  }
  return input;
}

// --- Visualization helpers -------------------------------------------------

export type BracketSegment = { rate: number; from: number; to: number; filled: number };

/** Slice taxable income across the ordinary brackets — how many dollars fall in each. */
export function bracketSegments(taxableIncome: number, brackets: Bracket[]): BracketSegment[] {
  let prev = 0;
  const out: BracketSegment[] = [];
  for (const b of brackets) {
    const filled = Math.max(0, Math.min(taxableIncome, b.upTo) - prev);
    if (filled > 0 || prev < taxableIncome) out.push({ rate: b.rate, from: prev, to: b.upTo, filled });
    prev = b.upTo;
    if (prev >= taxableIncome) break;
  }
  return out;
}

/** Dollars of headroom left in the current marginal bracket before the next rate. */
export function bracketHeadroom(taxableIncome: number, brackets: Bracket[]): { rate: number; nextRate: number | null; headroom: number } {
  let prev = 0;
  for (const b of brackets) {
    if (taxableIncome <= b.upTo) {
      const idx = brackets.indexOf(b);
      const next = brackets[idx + 1];
      return { rate: b.rate, nextRate: next ? next.rate : null, headroom: Number.isFinite(b.upTo) ? b.upTo - taxableIncome : Infinity };
    }
    prev = b.upTo;
  }
  return { rate: brackets[brackets.length - 1]?.rate ?? 0, nextRate: null, headroom: Infinity };
}

// --- Roth-conversion bracket-fill optimizer --------------------------------

export type RothFillTarget = { rate: number; nextRate: number | null; top: number; fill: number };

/**
 * How much additional ordinary income (a Roth conversion) would exactly fill
 * each remaining ordinary bracket, starting from the scenario's ordinary taxable
 * income *excluding* any current Roth-conversion lever. Approximate — ignores
 * second-order effects (e.g. a conversion nudging Social-Security taxability).
 */
export function rothFillTargets(baseInput: TaxReturnInput, leversExceptRoth: ScenarioLevers): { ordinaryTaxable: number; targets: RothFillTarget[] } {
  const r = computeFederalReturn(applyLevers(baseInput, { ...leversExceptRoth, rothConversion: 0 }));
  const brackets = yearData(r.taxYear).ordinaryBrackets[r.filingStatus];
  const ord = r.ordinaryTaxableIncome;
  const targets: RothFillTarget[] = [];
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (Number.isFinite(b.upTo) && b.upTo > ord) {
      targets.push({ rate: b.rate, nextRate: brackets[i + 1]?.rate ?? null, top: b.upTo, fill: b.upTo - ord });
    }
  }
  return { ordinaryTaxable: ord, targets };
}

// --- Consequences ----------------------------------------------------------

export type Consequence = { label: string; detail: string; tone: 'warn' | 'good' | 'info' };

const money = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/** Compare baseline vs scenario results and describe the cascading effects. */
export function scenarioConsequences(base: TaxReturnResult, scen: TaxReturnResult): Consequence[] {
  const out: Consequence[] = [];

  if (scen.filingStatus !== base.filingStatus) {
    out.push({ label: 'Filing status changed', detail: `${base.filingStatus.toUpperCase()} → ${scen.filingStatus.toUpperCase()}`, tone: 'info' });
  }
  if (scen.marginalRate !== base.marginalRate) {
    const up = scen.marginalRate > base.marginalRate;
    out.push({ label: `Top bracket ${up ? 'rises' : 'drops'} to ${pct(scen.marginalRate)}`, detail: `from ${pct(base.marginalRate)}`, tone: up ? 'warn' : 'good' });
  }
  if (scen.niitTax > 0 && base.niitTax === 0) out.push({ label: 'Net Investment Income Tax now applies', detail: `+${money(scen.niitTax)} — 3.8% once MAGI clears the threshold`, tone: 'warn' });
  else if (scen.niitTax === 0 && base.niitTax > 0) out.push({ label: 'No longer owe NIIT', detail: `saves ${money(base.niitTax)}`, tone: 'good' });

  if (scen.additionalMedicareTax > 0 && base.additionalMedicareTax === 0) out.push({ label: 'Additional Medicare tax kicks in', detail: '0.9% on wages / SE earnings over the threshold', tone: 'warn' });

  if (scen.amtAmount > 0 && base.amtAmount === 0) out.push({ label: 'AMT now applies', detail: `+${money(scen.amtAmount)} alternative minimum tax`, tone: 'warn' });
  else if (scen.amtAmount === 0 && base.amtAmount > 0) out.push({ label: 'AMT no longer applies', detail: `saves ${money(base.amtAmount)}`, tone: 'good' });

  if (scen.credits.childTaxCredit < base.credits.childTaxCredit - 0.5) out.push({ label: 'Child Tax Credit phases down', detail: `−${money(base.credits.childTaxCredit - scen.credits.childTaxCredit)} from the MAGI phaseout`, tone: 'warn' });
  if (scen.credits.education < base.credits.education - 0.5) out.push({ label: 'Education credit reduced', detail: `−${money(base.credits.education - scen.credits.education)} (MAGI phaseout)`, tone: 'warn' });

  if (scen.qbiDeduction < base.qbiDeduction - 1) out.push({ label: 'QBI deduction shrinks', detail: `−${money(base.qbiDeduction - scen.qbiDeduction)} (199A limit)`, tone: 'warn' });
  else if (scen.qbiDeduction > base.qbiDeduction + 1) out.push({ label: 'QBI deduction grows', detail: `+${money(scen.qbiDeduction - base.qbiDeduction)}`, tone: 'good' });

  if (scen.taxableSocialSecurity > base.taxableSocialSecurity + 1) out.push({ label: 'More Social Security becomes taxable', detail: `+${money(scen.taxableSocialSecurity - base.taxableSocialSecurity)}`, tone: 'warn' });
  else if (scen.taxableSocialSecurity < base.taxableSocialSecurity - 1) out.push({ label: 'Less Social Security taxed', detail: `−${money(base.taxableSocialSecurity - scen.taxableSocialSecurity)}`, tone: 'good' });

  if (scen.deductionKind !== base.deductionKind) out.push({ label: `Switches to the ${scen.deductionKind} deduction`, detail: scen.deductionKind === 'itemized' ? 'itemizing now beats the standard deduction' : 'standard deduction now wins', tone: 'info' });

  return out;
}
