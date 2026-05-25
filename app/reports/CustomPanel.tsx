'use client';

import { useEffect, useState } from 'react';

import {
  DEFAULT_QUERY,
  FLOW_OPTIONS,
  GROUP_BY_OPTIONS,
  type ReportQueryDef,
  type ReportResult,
  type SavedQuery,
} from '@/lib/reports/query-types';
import { fmtMoney0 as money0 } from '@/lib/format';

const field = 'rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500';

function monthLabel(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) return new Date(key + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return key;
}

export function CustomPanel() {
  const [def, setDef] = useState<ReportQueryDef>(DEFAULT_QUERY);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState<SavedQuery[]>([]);

  const set = <K extends keyof ReportQueryDef>(k: K, v: ReportQueryDef[K]) => setDef((d) => ({ ...d, [k]: v }));

  async function run(d: ReportQueryDef = def) {
    setRunning(true);
    const res = await fetch('/api/reports/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    const j = await res.json().catch(() => ({}));
    setResult(j?.data ?? null);
    setRunning(false);
  }

  async function refreshSaved() {
    const j = await fetch('/api/reports/queries').then((r) => r.json()).catch(() => ({}));
    setSaved(j?.data ?? []);
  }

  useEffect(() => { void run(DEFAULT_QUERY); void refreshSaved(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    const name = window.prompt('Name this report:');
    if (!name?.trim()) return;
    await fetch('/api/reports/queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), definition: def }) });
    void refreshSaved();
  }
  async function loadSaved(q: SavedQuery) {
    setDef(q.definition);
    void run(q.definition);
  }
  async function del(id: string) {
    await fetch(`/api/reports/queries/${id}`, { method: 'DELETE' });
    void refreshSaved();
  }

  const max = result && result.rows.length ? Math.max(...result.rows.map((r) => r.total)) : 1;
  const groupLabel = GROUP_BY_OPTIONS.find((g) => g.id === def.groupBy)?.label ?? 'Group';

  return (
    <>
      {/* Builder controls */}
      <section className="rounded-xl bg-surface-1 border border-border-subtle p-5 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Group by</span>
            <select className={field} value={def.groupBy} onChange={(e) => set('groupBy', e.target.value as ReportQueryDef['groupBy'])}>
              {GROUP_BY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Flow</span>
            <select className={field} value={def.flow} onChange={(e) => set('flow', e.target.value as ReportQueryDef['flow'])}>
              {FLOW_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">From</span>
            <input type="date" className={field} value={def.from ?? ''} onChange={(e) => set('from', e.target.value || null)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">To</span>
            <input type="date" className={field} value={def.to ?? ''} onChange={(e) => set('to', e.target.value || null)} />
          </label>
          <label className="flex flex-col gap-1 w-24">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Min $</span>
            <input inputMode="decimal" className={field} value={def.minAmount ?? ''} onChange={(e) => set('minAmount', e.target.value ? Number(e.target.value) : null)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1 w-24">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Max $</span>
            <input inputMode="decimal" className={field} value={def.maxAmount ?? ''} onChange={(e) => set('maxAmount', e.target.value ? Number(e.target.value) : null)} placeholder="∞" />
          </label>
          <button type="button" onClick={() => run()} disabled={running} className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-50">
            {running ? 'Running…' : 'Run'}
          </button>
          <button type="button" onClick={save} className="rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2">
            Save
          </button>
        </div>

        {saved.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-border-subtle">
            <span className="text-[11px] uppercase tracking-[0.06em] text-text-muted">Saved</span>
            {saved.map((q) => (
              <span key={q.id} className="group flex items-center gap-1 rounded-full bg-surface-2 border border-border-subtle pl-3 pr-1.5 py-1 text-[12.5px]">
                <button type="button" onClick={() => loadSaved(q)} className="text-text-secondary hover:text-text-primary">{q.name}</button>
                <button type="button" onClick={() => del(q.id)} aria-label={`Delete ${q.name}`} className="text-text-muted hover:text-negative px-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Results */}
      {result == null ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-12 text-center text-[13px] text-text-tertiary">
          {running ? 'Running…' : 'Choose options and run a report.'}
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-12 text-center text-[13px] text-text-tertiary">
          No transactions match these filters.
        </div>
      ) : (
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[14px] font-semibold">By {groupLabel.toLowerCase()}</h2>
            <span className="text-[12.5px] text-text-tertiary tabular-nums">{money0(result.total)} · {result.count} txns · {result.rows.length} rows</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {result.rows.map((r) => (
              <div key={r.key} className="relative rounded-lg overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-lg bg-accent-500 opacity-[0.13]" style={{ width: `${(r.total / max) * 100}%` }} />
                <div className="relative flex justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="truncate text-text-secondary">{def.groupBy === 'month' ? monthLabel(r.label) : r.label}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-[11.5px] text-text-muted tabular-nums">{result.total > 0 ? Math.round((r.total / result.total) * 100) : 0}%</span>
                    <span className="tabular-nums text-text-primary">{money0(r.total)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
