'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { GoalView } from '@/lib/goals/load';

export type AccountOption = { id: string; label: string; assetClass: string };

const numOrNull = (s: string): number | null => {
  const t = s.replace(/[$,]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function GoalForm({
  goal,
  accountOptions,
  onClose,
}: {
  goal?: GoalView;
  accountOptions: AccountOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = !!goal;
  const [name, setName] = useState(goal?.name ?? '');
  const [type, setType] = useState<'save_up' | 'pay_down'>(goal?.type ?? 'save_up');
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount != null ? String(goal.targetAmount) : '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [monthly, setMonthly] = useState(goal?.monthlyContribution != null ? String(goal.monthlyContribution) : '');
  const [growth, setGrowth] = useState(goal?.growthRatePct != null ? String(goal.growthRatePct) : '');
  // accountId → allocation amount string ('' = use the entire balance). Presence = assigned.
  const [alloc, setAlloc] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const a of goal?.accounts ?? []) m.set(a.id, a.useEntireBalance ? '' : String(a.allocatedAmount ?? ''));
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Save-up assigns asset accounts; pay-down assigns liabilities.
  const relevant = accountOptions.filter((a) => (type === 'pay_down' ? a.assetClass === 'liability' : a.assetClass === 'asset'));

  function toggle(id: string) {
    setAlloc((cur) => {
      const next = new Map(cur);
      if (next.has(id)) next.delete(id);
      else next.set(id, '');
      return next;
    });
  }
  function setAmount(id: string, v: string) {
    setAlloc((cur) => new Map(cur).set(id, v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    const accounts = [...alloc.entries()].map(([accountId, amt]) => {
      const n = type === 'save_up' ? numOrNull(amt) : null;
      return { accountId, useEntireBalance: n == null, allocatedAmount: n };
    });
    const body = {
      name: name.trim(),
      type,
      targetAmount: type === 'save_up' ? numOrNull(targetAmount) : null,
      targetDate: type === 'save_up' ? targetDate || null : null,
      monthlyContribution: numOrNull(monthly),
      growthRatePct: type === 'save_up' ? numOrNull(growth) : null,
      accounts,
    };
    try {
      const res = await fetch(editing ? `/api/goals/${goal!.id}` : '/api/goals', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok || json.error) { setError(json?.error?.message ?? `HTTP ${res.status}`); return; }
      router.refresh();
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  const field = 'w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-500';
  const lbl = 'flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-10" onClick={onClose}>
      <form className="w-full max-w-[560px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-7" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-5">{editing ? 'Edit goal' : 'New goal'}</h2>
        {error && <div className="mb-4 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}

        <div className="flex flex-col gap-4">
          {/* Type toggle */}
          <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[13px] self-start">
            {(['save_up', 'pay_down'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setAlloc(new Map()); }}
                className={`rounded-md px-4 py-1.5 font-medium transition-colors ${type === t ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}
              >
                {t === 'save_up' ? 'Save up' : 'Pay down debt'}
              </button>
            ))}
          </div>

          <label className={lbl}>
            Name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'save_up' ? 'e.g. New hyperdrive' : 'e.g. Pay off Death Star loan'} autoFocus maxLength={120} />
          </label>

          {type === 'save_up' && (
            <div className="grid grid-cols-2 gap-3">
              <label className={lbl}>
                Target
                <input className={field} value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} inputMode="decimal" placeholder="12000" />
              </label>
              <label className={lbl}>
                Target date
                <input className={field} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </label>
              <label className={lbl}>
                Monthly contribution
                <input className={field} value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" placeholder="1138" />
              </label>
              <label className={lbl}>
                Growth rate %/yr <span className="font-normal text-text-muted">(optional)</span>
                <input className={field} value={growth} onChange={(e) => setGrowth(e.target.value)} inputMode="decimal" placeholder="7" />
              </label>
            </div>
          )}
          {type === 'pay_down' && (
            <label className={lbl}>
              Extra monthly payment <span className="font-normal text-text-muted">(optional)</span>
              <input className={field} value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" placeholder="327" />
              <span className="text-[11px] text-text-muted font-normal">Payoff projection uses each account&rsquo;s APR + monthly payment (set on Accounts).</span>
            </label>
          )}

          <div className={lbl}>
            {type === 'pay_down' ? 'Debt accounts' : 'Saving in'}
            <div className="rounded-lg border border-border-subtle bg-surface-2 max-h-44 overflow-y-auto divide-y divide-border-subtle">
              {relevant.length === 0 ? (
                <div className="px-3 py-3 text-[12.5px] text-text-tertiary">No {type === 'pay_down' ? 'liability' : 'asset'} accounts found.</div>
              ) : (
                relevant.map((a) => {
                  const selected = alloc.has(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-surface-3">
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                        <input type="checkbox" checked={selected} onChange={() => toggle(a.id)} className="accent-accent-500" />
                        <span className="text-text-secondary truncate">{a.label}</span>
                      </label>
                      {selected && type === 'save_up' && (
                        <input
                          value={alloc.get(a.id) ?? ''}
                          onChange={(e) => setAmount(a.id, e.target.value)}
                          inputMode="decimal"
                          placeholder="Entire balance"
                          className="w-32 shrink-0 rounded-md bg-surface-1 border border-border-subtle px-2 py-1 text-[12px] text-right tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-500"
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {type === 'save_up' && <span className="text-[11px] text-text-muted font-normal">Leave an amount blank to use the account&rsquo;s entire balance.</span>}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save goal' : 'Create goal'}
          </button>
        </div>
      </form>
    </div>
  );
}
