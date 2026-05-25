'use client';

import { useMemo, useState } from 'react';

import { simulatePayoff, type Debt, type Method } from '@/lib/goals/payoff-scenario';
import { fmtDate, fmtMoney0 } from '@/lib/format';

function monthsLabel(n: number | null): string {
  if (n == null) return '—';
  if (n <= 0) return 'now';
  if (n < 12) return `${n} mo`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return m ? `${y}y ${m}m` : `${y} yr`;
}

const METHOD_HINT: Record<Method, string> = {
  avalanche: 'Highest APR first — pays the least total interest.',
  snowball: 'Smallest balance first — quick wins for momentum.',
};

export function DebtPayoffPlan({ debts }: { debts: Debt[] }) {
  const [method, setMethod] = useState<Method>('avalanche');
  const [extra, setExtra] = useState('');
  const [lump, setLump] = useState('');
  const extraN = Number(extra.replace(/[$,]/g, '')) || 0;
  const lumpN = Number(lump.replace(/[$,]/g, '')) || 0;

  const baseline = useMemo(() => simulatePayoff(debts, { method, extraMonthly: 0, lumpSum: 0 }), [debts, method]);
  const scenario = useMemo(() => simulatePayoff(debts, { method, extraMonthly: extraN, lumpSum: lumpN }), [debts, method, extraN, lumpN]);

  const totalOwed = debts.reduce((s, d) => s + d.balance, 0);
  const hasWhatIf = extraN > 0 || lumpN > 0;
  const monthsSaved = baseline.months != null && scenario.months != null ? baseline.months - scenario.months : null;
  const interestSaved = baseline.totalInterest - scenario.totalInterest;

  const fieldCls = 'w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[14px] text-text-primary tabular-nums focus:outline-none focus:border-accent-500';

  return (
    <section className="rounded-2xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Debt payoff plan</h2>
          <p className="text-[12px] text-text-tertiary">{fmtMoney0(totalOwed)} across {debts.length} debt{debts.length === 1 ? '' : 's'}</p>
        </div>
        <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[12px]">
          {(['avalanche', 'snowball'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)}
              className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${method === m ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11.5px] text-text-muted mb-4">{METHOD_HINT[method]}</p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary">
          Extra monthly payment
          <input className={fieldCls} value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" placeholder="$0" />
        </label>
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary">
          One-time lump sum
          <input className={fieldCls} value={lump} onChange={(e) => setLump(e.target.value)} inputMode="decimal" placeholder="$0" />
        </label>
      </div>

      {!scenario.feasible ? (
        <div className="rounded-lg bg-amber-400/10 border border-amber-400/30 px-3 py-2 text-[13px] text-amber-400">
          Current payments don&rsquo;t cover the interest on every debt — add an extra payment (or set higher minimums on the accounts) to reach a payoff date.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Debt-free</div>
              <div className="text-[18px] font-semibold tabular-nums">{scenario.debtFreeDate ? fmtDate(scenario.debtFreeDate) : '—'}</div>
              <div className="text-[11.5px] text-text-tertiary">{monthsLabel(scenario.months)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Total interest</div>
              <div className="text-[18px] font-semibold tabular-nums text-negative">{fmtMoney0(scenario.totalInterest)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">{hasWhatIf ? 'You save' : 'vs minimums'}</div>
              {hasWhatIf && monthsSaved != null ? (
                <>
                  <div className="text-[18px] font-semibold tabular-nums text-positive">{fmtMoney0(interestSaved)}</div>
                  <div className="text-[11.5px] text-text-tertiary">{monthsLabel(monthsSaved)} sooner</div>
                </>
              ) : (
                <div className="text-[13px] text-text-tertiary mt-1">add an extra payment to compare</div>
              )}
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border-subtle">
            {scenario.perDebt.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="size-5 rounded-full bg-surface-3 text-text-tertiary text-[11px] flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex-1 truncate text-text-secondary">{d.name}</span>
                <span className="text-text-tertiary tabular-nums w-24 text-right">{d.payoffDate ? fmtDate(d.payoffDate) : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
