'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  workspaceToInput, computeReturn, applyLevers, emptyLevers, leversActive, scenarioConsequences, bracketSegments, yearData,
  type TaxWorkspace, type ScenarioLevers, type FilingStatus, type Consequence,
} from '@/lib/tax-engine';
import { PageHeader } from '@/components/PageHeader';
import { fmtMoney0 } from '@/lib/format';
import { TaxTabs } from '../TaxTabs';
import { MoneyInput } from '../prepare/ui';
import { BracketLadder, BracketFill, CompareBar } from './viz';

type LeverKey = Exclude<keyof ScenarioLevers, 'filingStatus'>;
const LEVERS: { key: LeverKey; label: string; hint: string; min: number; max: number; step: number }[] = [
  { key: 'additionalOrdinaryIncome', label: 'Additional ordinary income', hint: 'raise, bonus, interest', min: 0, max: 200_000, step: 1_000 },
  { key: 'rothConversion', label: 'Roth conversion', hint: 'traditional → Roth (taxable now)', min: 0, max: 300_000, step: 1_000 },
  { key: 'additionalLongTermGains', label: 'Realize long-term gains', hint: 'negative = harvest losses', min: -100_000, max: 300_000, step: 1_000 },
  { key: 'additionalShortTermGains', label: 'Realize short-term gains', hint: 'taxed as ordinary', min: -100_000, max: 200_000, step: 1_000 },
  { key: 'preTaxRetirement', label: 'Pre-tax retirement', hint: 'traditional 401(k)/IRA — lowers AGI', min: 0, max: 70_000, step: 500 },
  { key: 'additionalHsa', label: 'HSA contribution', hint: 'lowers AGI', min: 0, max: 9_000, step: 100 },
  { key: 'additionalCharitable', label: 'Charitable giving', hint: 'itemized deduction', min: 0, max: 100_000, step: 500 },
];
const FILING_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Same as return' },
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
  { value: 'hoh', label: 'Head of household' },
];

const pct1 = (r: number) => `${(r * 100).toFixed(1)}%`;

export function PlanClient({ initialWorkspace, year, supportedYears }: { initialWorkspace: TaxWorkspace; year: number; supportedYears: number[] }) {
  const router = useRouter();
  const [levers, setLevers] = useState<ScenarioLevers>(emptyLevers());
  const ws = initialWorkspace;

  const baseInput = useMemo(() => workspaceToInput(ws), [ws]);
  const base = useMemo(() => computeReturn(baseInput), [baseInput]);
  const scen = useMemo(() => computeReturn(applyLevers(baseInput, levers)), [baseInput, levers]);
  const active = leversActive(levers);
  const consequences = useMemo(() => (active ? scenarioConsequences(base, scen) : []), [active, base, scen]);

  const brackets = yearData(year).ordinaryBrackets[scen.filingStatus];
  const baseSegs = useMemo(() => bracketSegments(base.taxableIncome, yearData(year).ordinaryBrackets[base.filingStatus]), [base, year]);
  const scenSegs = useMemo(() => bracketSegments(scen.taxableIncome, brackets), [scen, brackets]);

  const dIncome = scen.totalIncome - base.totalIncome;
  const dTax = scen.totalTax - base.totalTax;
  const dRefund = scen.refundOrOwed - base.refundOrOwed;
  const deductionLevers = levers.preTaxRetirement + levers.additionalHsa + levers.additionalCharitable;
  const marginal: { label: string; value: string } =
    Math.abs(dIncome) >= 1 ? { label: 'Rate on the change', value: pct1(dTax / dIncome) }
    : deductionLevers > 0 ? { label: 'Saved per $1 deducted', value: pct1(-dTax / deductionLevers) }
    : { label: 'Rate on the change', value: '—' };

  const setLever = (key: LeverKey, v: number) => setLevers((p) => ({ ...p, [key]: v }));

  const yearSelect = (
    <select
      className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
      value={year}
      onChange={(e) => router.push(`/tax/plan?year=${e.target.value}`)}
      aria-label="Tax year"
    >
      {supportedYears.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title="Tax" subtitle="Plan · drag a lever to see the cascade" actions={<><TaxTabs />{yearSelect}</>} />

      {base.totalIncome === 0 && (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-4 text-[12.5px] text-text-tertiary mb-5">
          Your <strong className="text-text-secondary">Prepare</strong> return is empty for {year}, so the baseline is $0. Add documents there first — then model changes here.
        </div>
      )}

      <div className="grid lg:grid-cols-[340px_1fr] gap-5">
        {/* Levers */}
        <div className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden self-start">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
            <h3 className="text-[13.5px] font-semibold">What-if levers</h3>
            {active && <button onClick={() => setLevers(emptyLevers())} className="text-[11px] text-text-muted hover:text-accent-500">Reset</button>}
          </div>
          <div className="p-4 flex flex-col gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[12px] text-text-secondary">Filing status</span>
              </div>
              <select
                value={levers.filingStatus ?? ''}
                onChange={(e) => setLevers((p) => ({ ...p, filingStatus: (e.target.value || null) as FilingStatus | null }))}
                className="w-full rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[12.5px] text-text-secondary focus:outline-none focus:border-accent-500"
              >
                {FILING_CHOICES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {LEVERS.map((lv) => (
              <div key={lv.key}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <span className="text-[12px] text-text-secondary">{lv.label}</span>
                    <span className="block text-[10.5px] text-text-muted">{lv.hint}</span>
                  </div>
                  <div className="w-[110px] shrink-0"><MoneyInput value={levers[lv.key]} onChange={(n) => setLever(lv.key, n)} /></div>
                </div>
                <input
                  type="range"
                  min={lv.min} max={lv.max} step={lv.step}
                  value={Math.min(lv.max, Math.max(lv.min, levers[lv.key]))}
                  onChange={(e) => setLever(lv.key, Number(e.target.value))}
                  className="w-full accent-[var(--color-accent-500)] cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-5 min-w-0">
          {/* Delta highlights */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <DeltaTile label="Total tax" base={base.totalTax} scen={scen.totalTax} lowerBetter />
            <DeltaTile label={scen.refundOrOwed >= 0 ? 'Refund' : 'Balance due'} base={Math.abs(base.refundOrOwed)} scen={Math.abs(scen.refundOrOwed)} lowerBetter={scen.refundOrOwed < 0} />
            <PlainTile label={marginal.label} value={marginal.value} accent />
            <PlainTile label="Effective rate" value={scen.effectiveRate != null ? `${scen.effectiveRate}%` : '—'} sub={base.effectiveRate != null ? `was ${base.effectiveRate}%` : undefined} />
          </div>

          {/* Consequences */}
          {active && consequences.length > 0 && (
            <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
              <h3 className="text-[13px] font-semibold px-4 py-2.5 border-b border-border-subtle">Cascading effects</h3>
              <div className="p-3 flex flex-col gap-2">
                {consequences.map((c, i) => <ConsequenceRow key={i} c={c} />)}
              </div>
            </section>
          )}
          {active && consequences.length === 0 && (
            <p className="text-[12px] text-text-tertiary">No bracket crossings or surtax/credit triggers — the change stays within your current marginal rate.</p>
          )}

          {/* Comparison bars */}
          <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
            <h3 className="text-[13px] font-semibold px-4 py-2.5 border-b border-border-subtle">Now vs scenario</h3>
            <div className="p-4 grid sm:grid-cols-3 gap-5">
              <CompareBar label="Total tax" baseline={base.totalTax} scenario={scen.totalTax} format={fmtMoney0} lowerIsBetter />
              <CompareBar label="After-tax income" baseline={base.totalIncome - base.totalTax} scenario={scen.totalIncome - scen.totalTax} format={fmtMoney0} lowerIsBetter={false} />
              <CompareBar label="Taxable income" baseline={base.taxableIncome} scenario={scen.taxableIncome} format={fmtMoney0} lowerIsBetter />
            </div>
          </section>

          {/* Bracket ladder */}
          <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-subtle">
              <h3 className="text-[13px] font-semibold">Where you land in the brackets</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Marginal ordinary rate by taxable income — see how close the next bracket is.</p>
            </div>
            <div className="p-4"><BracketLadder brackets={brackets} baseline={base.taxableIncome} scenario={scen.taxableIncome} /></div>
          </section>

          {/* Bracket fill */}
          <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-subtle">
              <h3 className="text-[13px] font-semibold">Taxable income by bracket</h3>
              <p className="text-[11px] text-text-muted mt-0.5">Which rate buckets your income fills — and where new dollars land.</p>
            </div>
            <div className="p-4"><BracketFill baseline={baseSegs} scenario={scenSegs} /></div>
          </section>
        </div>
      </div>
    </>
  );
}

function DeltaTile({ label, base, scen, lowerBetter }: { label: string; base: number; scen: number; lowerBetter: boolean }) {
  const d = scen - base;
  const flat = Math.abs(d) < 0.5;
  const good = lowerBetter ? d < 0 : d > 0;
  const color = flat ? 'text-text-primary' : good ? 'text-positive' : 'text-negative';
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted mb-1">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums text-text-primary">{fmtMoney0(scen)}</div>
      <div className={`text-[11.5px] font-medium tabular-nums mt-0.5 ${color}`}>{flat ? 'no change' : `${d > 0 ? '+' : '−'}${fmtMoney0(Math.abs(d))}`}</div>
    </section>
  );
}

function PlainTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted mb-1">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums ${accent ? 'text-accent-500' : 'text-text-primary'}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-text-muted mt-0.5">{sub}</div>}
    </section>
  );
}

function ConsequenceRow({ c }: { c: Consequence }) {
  const dot = c.tone === 'warn' ? 'bg-negative' : c.tone === 'good' ? 'bg-positive' : 'bg-cat-blue';
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2">
      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-text-primary">{c.label}</div>
        {c.detail && <div className="text-[11.5px] text-text-muted">{c.detail}</div>}
      </div>
    </div>
  );
}
