'use client';

import { useMemo, useState } from 'react';

import type { ForecastInputs } from '@/lib/forecasting/load';
import { project, type ProjectionPoint } from '@/lib/forecasting/project';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0 } from '@/lib/format';

const field =
  'rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500 w-full';

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${n < 0 ? '-' : ''}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1000) return `${n < 0 ? '-' : ''}$${Math.round(a / 1000)}k`;
  return money0(n);
}

/** Two-line projection chart: nominal (solid) + real / today's-$ (dashed), with an FI marker. */
function ProjectionChart({ points, fiYear, height = 260 }: { points: ProjectionPoint[]; fiYear: number | null; height?: number }) {
  if (points.length < 2) return null;
  const W = 1000;
  const H = height;
  const padTop = 12;
  const padBottom = 22;
  const plotH = H - padTop - padBottom;
  const max = Math.max(...points.map((p) => p.nominal), 1);
  const n = points.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => padTop + plotH - (v / max) * plotH;
  const line = (key: 'nominal' | 'real') => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('nominal')} L${W},${padTop + plotH} L0,${padTop + plotH} Z`;
  const fiX = fiYear != null ? x(fiYear) : null;
  const grid = [max, max * 0.75, max * 0.5, max * 0.25];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((g, i) => (
        <g key={i}>
          <line x1="0" x2={W} y1={y(g)} y2={y(g)} className="cf-grid" stroke="var(--color-border-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={W - 4} y={y(g) - 3} textAnchor="end" className="fill-text-muted" style={{ fontSize: 11 }}>{compact(g)}</text>
        </g>
      ))}
      {fiX != null && (
        <line x1={fiX} x2={fiX} y1={padTop} y2={padTop + plotH} stroke="var(--color-accent-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />
      )}
      <path d={area} fill="url(#fc-area)" />
      <path d={line('real')} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />
      <path d={line('nominal')} fill="none" stroke="var(--color-positive)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ForecastingClient({ inputs }: { inputs: ForecastInputs }) {
  const defaultMonthly = Math.max(0, Math.round(inputs.annualSavings / 12));
  const [monthly, setMonthly] = useState(defaultMonthly);
  const [returnPct, setReturnPct] = useState(7);
  const [inflationPct, setInflationPct] = useState(3);
  const [raisePct, setRaisePct] = useState(2);
  const [years, setYears] = useState(30);

  const proj = useMemo(
    () =>
      project({
        startNetWorth: inputs.netWorth,
        annualContribution: monthly * 12,
        annualReturnPct: returnPct,
        inflationPct,
        contributionGrowthPct: raisePct,
        years,
        annualExpenses: inputs.annualExpenses,
      }),
    [inputs.netWorth, inputs.annualExpenses, monthly, returnPct, inflationPct, raisePct, years],
  );

  const savingsRate = inputs.annualIncome > 0 ? Math.round((inputs.annualSavings / inputs.annualIncome) * 100) : null;

  return (
    <>
      <PageHeader
        title="Forecasting"
        subtitle="Where you’re heading if nothing changes — and what changes if you change the inputs."
      />

      {!inputs.hasData ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <h2 className="text-[16px] font-semibold mb-1">Not enough data to project yet</h2>
          <p className="text-[13px] text-text-tertiary max-w-md mx-auto">
            Import statements so Vault knows your net worth and savings rate, then this page projects your trajectory.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatTile size="lg" label="Net worth today" value={money0(inputs.netWorth)} />
            <StatTile size="lg" label="Savings / yr" value={money0(inputs.annualSavings)} tone={inputs.annualSavings >= 0 ? 'pos' : 'neg'} sub={savingsRate != null ? `${savingsRate}% of income` : 'trailing 12 mo'} />
            <StatTile size="lg" label="FI number" value={proj.fiNumber > 0 ? money0(proj.fiNumber) : '—'} sub="25× expenses (4% rule)" />
            <StatTile size="lg" label="Financial independence" value={proj.fiYear != null ? `${proj.fiYear} yr${proj.fiYear === 1 ? '' : 's'}` : '40+ yrs'} tone={proj.fiYear != null && proj.fiYear <= years ? 'pos' : 'default'} sub={proj.fiYear != null ? `≈ ${new Date().getFullYear() + proj.fiYear}` : 'beyond horizon'} />
          </div>

          {/* Scenario controls */}
          <section className="rounded-xl bg-surface-1 border border-border-subtle p-5 mb-5">
            <h2 className="text-[14px] font-semibold mb-4">Scenario</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Monthly contribution</span>
                <input className={field} inputMode="numeric" value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Return %/yr</span>
                <input className={field} inputMode="decimal" value={returnPct} onChange={(e) => setReturnPct(Number(e.target.value) || 0)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Inflation %/yr</span>
                <input className={field} inputMode="decimal" value={inflationPct} onChange={(e) => setInflationPct(Number(e.target.value) || 0)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Annual raise %</span>
                <input className={field} inputMode="decimal" value={raisePct} onChange={(e) => setRaisePct(Number(e.target.value) || 0)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Horizon (yrs)</span>
                <input className={field} inputMode="numeric" value={years} onChange={(e) => setYears(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
              </label>
            </div>
          </section>

          {/* Projection */}
          <section className="rounded-2xl bg-surface-1 border border-border-subtle p-6 mb-5">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1">Projected net worth in {years} years</div>
                <div className="text-[34px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{money0(proj.finalNominal)}</div>
                <div className="text-[12.5px] text-text-tertiary mt-1">{money0(proj.finalReal)} in today’s dollars · {money0(proj.totalContributed)} contributed</div>
              </div>
              <div className="flex items-center gap-4 text-[12px]">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-positive rounded" /> Nominal</span>
                <span className="flex items-center gap-1.5 text-text-tertiary"><span className="inline-block w-4 h-0.5 rounded border-t border-dashed border-text-muted" /> Today’s $</span>
                {proj.fiYear != null && proj.fiYear <= years && <span className="flex items-center gap-1.5 text-accent-300"><span className="inline-block w-3 border-l border-dashed border-accent-500 h-3" /> FI</span>}
              </div>
            </div>
            <ProjectionChart points={proj.points} fiYear={proj.fiYear != null && proj.fiYear <= years ? proj.fiYear : null} />
          </section>

          {/* Milestones */}
          {proj.milestones.length > 0 && (
            <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
              <h2 className="text-[14px] font-semibold mb-3">Milestones</h2>
              <div className="flex flex-col divide-y divide-border-subtle">
                {proj.milestones.map((m) => (
                  <div key={m.label} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="font-medium tabular-nums">{m.label}</span>
                    <span className="text-text-tertiary tabular-nums">
                      {m.year != null ? `in ${m.year} yr${m.year === 1 ? '' : 's'} · ≈ ${new Date().getFullYear() + m.year}` : 'beyond horizon'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11.5px] text-text-muted mt-4 leading-relaxed">
            Projection compounds annually: net worth × (1 + return) + contribution (growing by your annual raise). Defaults
            seed from your trailing-12-month savings and current net worth — adjust any input to explore what-ifs. Estimates
            only; markets aren’t this smooth.
          </p>
        </>
      )}
    </>
  );
}
