'use client';

import { aggregateDocuments, type TaxWorkspace, type TaxReturnResult } from '@/lib/tax-engine';
import { fmtMoney0 } from '@/lib/format';
import { MoneyInput, IntInput, Toggle, FieldRow, Panel } from './ui';

function Derived({ value, note }: { value: number; note: string }) {
  return (
    <div className="grid grid-cols-[1fr_160px] items-center gap-3 py-1.5">
      <div className="min-w-0"><span className="text-[12.5px] text-text-secondary">{note}</span></div>
      <span className="text-[13px] text-text-muted tabular-nums text-right pr-2.5">{fmtMoney0(value)}</span>
    </div>
  );
}

export function DeductionsSection({ ws, update, result }: { ws: TaxWorkspace; update: (mut: (d: TaxWorkspace) => void) => void; result: TaxReturnResult }) {
  const agg = aggregateDocuments(ws.documents);
  const it = ws.itemized;
  const adj = ws.adjustments;
  const cr = ws.credits;
  const pay = ws.payments;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Itemized deductions (Schedule A)">
        <FieldRow label="Medical & dental" note="7.5%-of-AGI floor applied"><MoneyInput value={it.medicalExpenses} onChange={(n) => update((d) => { d.itemized.medicalExpenses = n; })} /></FieldRow>
        <FieldRow label="State & local taxes (SALT)" note="capped at $10,000"><MoneyInput value={it.stateLocalTaxes} onChange={(n) => update((d) => { d.itemized.stateLocalTaxes = n; })} /></FieldRow>
        <Derived value={agg.mortgageInterest} note="Home mortgage interest (from 1098)" />
        <FieldRow label="Investment interest"><MoneyInput value={it.investmentInterest} onChange={(n) => update((d) => { d.itemized.investmentInterest = n; })} /></FieldRow>
        <FieldRow label="Charitable — cash"><MoneyInput value={it.charitableCash} onChange={(n) => update((d) => { d.itemized.charitableCash = n; })} /></FieldRow>
        <FieldRow label="Charitable — non-cash"><MoneyInput value={it.charitableNonCash} onChange={(n) => update((d) => { d.itemized.charitableNonCash = n; })} /></FieldRow>
        <FieldRow label="Casualty & theft losses"><MoneyInput value={it.casualtyTheft} onChange={(n) => update((d) => { d.itemized.casualtyTheft = n; })} /></FieldRow>
        <FieldRow label="Other itemized"><MoneyInput value={it.otherItemized} onChange={(n) => update((d) => { d.itemized.otherItemized = n; })} /></FieldRow>
      </Panel>

      <Panel title="Adjustments to income">
        <FieldRow label="HSA contribution"><MoneyInput value={adj.hsa} onChange={(n) => update((d) => { d.adjustments.hsa = n; })} /></FieldRow>
        <FieldRow label="Deductible IRA contribution"><MoneyInput value={adj.iraDeduction} onChange={(n) => update((d) => { d.adjustments.iraDeduction = n; })} /></FieldRow>
        <Derived value={Math.min(2500, agg.studentLoanInterest)} note="Student loan interest (from 1098-E, ≤ $2,500)" />
        <FieldRow label="Educator expenses"><MoneyInput value={adj.educatorExpenses} onChange={(n) => update((d) => { d.adjustments.educatorExpenses = n; })} /></FieldRow>
        <FieldRow label="Self-employed health insurance"><MoneyInput value={adj.seHealthInsurance} onChange={(n) => update((d) => { d.adjustments.seHealthInsurance = n; })} /></FieldRow>
        <FieldRow label="SE retirement (SEP / SIMPLE / solo-401k)"><MoneyInput value={adj.seRetirement} onChange={(n) => update((d) => { d.adjustments.seRetirement = n; })} /></FieldRow>
        <FieldRow label="Other adjustments"><MoneyInput value={adj.other} onChange={(n) => update((d) => { d.adjustments.other = n; })} /></FieldRow>
        <p className="text-[11px] text-text-muted mt-2">½ of self-employment tax is added automatically.</p>
      </Panel>

      <Panel title="Credits">
        <FieldRow label="Child & dependent care expenses" note="Form 2441"><MoneyInput value={cr.dependentCareExpenses} onChange={(n) => update((d) => { d.credits.dependentCareExpenses = n; })} /></FieldRow>
        <FieldRow label="Qualifying persons for care" note="caps expenses ($3k / $6k)"><IntInput value={cr.dependentCareQualifyingPersons} onChange={(n) => update((d) => { d.credits.dependentCareQualifyingPersons = n; })} /></FieldRow>
        <Derived value={result.credits.education} note="Education credits (from 1098-T)" />
        <FieldRow label="Residential energy credits"><MoneyInput value={cr.energyCredits} onChange={(n) => update((d) => { d.credits.energyCredits = n; })} /></FieldRow>
        <FieldRow label="Other credits"><MoneyInput value={cr.otherCredits} onChange={(n) => update((d) => { d.credits.otherCredits = n; })} /></FieldRow>
        <p className="text-[11px] text-text-muted mt-2">Child Tax Credit is computed from dependents in Profile.</p>
      </Panel>

      <Panel title="Payments & prior year">
        <Derived value={result.payments - ws.payments.estimatedPayments} note="Federal withholding (from W-2 / 1099s)" />
        <FieldRow label="Estimated payments made"><MoneyInput value={pay.estimatedPayments} onChange={(n) => update((d) => { d.payments.estimatedPayments = n; })} /></FieldRow>
        <FieldRow label="Prior-year total tax" note="for the safe-harbor target"><MoneyInput value={pay.priorYearTax} onChange={(n) => update((d) => { d.payments.priorYearTax = n; })} /></FieldRow>
        <div className="pt-2"><Toggle checked={pay.priorYearAgiOver150k} onChange={(b) => update((d) => { d.payments.priorYearAgiOver150k = b; })} label="Prior-year AGI was over $150,000 (safe harbor → 110%)" /></div>
      </Panel>
    </div>
  );
}
