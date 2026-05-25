'use client';

import { useEffect, useMemo, useState } from 'react';

import type { SEMappingRow } from '@/lib/properties/schedule-e-mapping';
import type { SELineDef } from '@/lib/properties/schedule-e-lines';
import { labelForKey } from '@/lib/properties/schedule-e-lines';

export function ScheduleEMappingModal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<SELineDef[]>([]);
  const [rows, setRows] = useState<SEMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/schedule-e/mapping')
      .then((r) => r.json())
      .then((j) => { if (alive && j?.data) { setLines(j.data.lines); setRows(j.data.rows); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.fullName.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  async function setLine(id: string, line: string | null) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, explicit: line } : r)));
    setSaving(id);
    await fetch('/api/schedule-e/mapping', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: id, line }),
    }).catch(() => {});
    setSaving(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[560px] max-h-[80vh] flex flex-col rounded-2xl bg-surface-1 border border-border-subtle shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border-subtle">
          <div>
            <h2 className="text-[16px] font-semibold">Schedule E mapping</h2>
            <p className="text-[12.5px] text-text-tertiary mt-0.5">
              Assign each spending category to a Schedule E line. “Auto” uses a keyword guess from the category name.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-[20px] leading-none px-1">×</button>
        </div>

        <div className="px-5 pt-3 pb-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter categories…"
            className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="py-10 text-center text-[13px] text-text-tertiary">Loading categories…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-text-tertiary">No matching categories.</div>
          ) : (
            <div className="flex flex-col divide-y divide-border-subtle">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0 text-[13px] text-text-secondary truncate" title={r.fullName}>{r.fullName}</span>
                  <select
                    value={r.explicit ?? ''}
                    onChange={(e) => setLine(r.id, e.target.value || null)}
                    disabled={saving === r.id}
                    className="shrink-0 w-[230px] rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[12.5px] text-text-secondary focus:outline-none focus:border-accent-500 disabled:opacity-50"
                  >
                    <option value="">Auto → {labelForKey(r.keywordKey)}</option>
                    {lines.map((l) => (
                      <option key={l.key} value={l.key}>Line {l.line} · {l.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
