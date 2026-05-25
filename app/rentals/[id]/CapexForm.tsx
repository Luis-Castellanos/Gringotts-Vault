'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CapexRow } from '@/lib/properties/capex';

const numOrNull = (s: string): number | null => {
  const t = s.replace(/[$,]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function CapexForm({ propertyId, item, onClose }: { propertyId: string; item?: CapexRow; onClose: () => void }) {
  const router = useRouter();
  const editing = !!item;
  const [description, setDescription] = useState(item?.description ?? '');
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : '');
  const [placedInService, setPlacedInService] = useState(item?.placedInService ?? new Date().toISOString().slice(0, 10));
  const [life, setLife] = useState(item?.usefulLifeYears != null ? String(item.usefulLifeYears) : '5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError('A description is required.'); return; }
    const costN = numOrNull(cost);
    if (costN == null) { setError('Enter a cost.'); return; }
    setSaving(true);
    setError(null);
    const body = {
      propertyId,
      description: description.trim(),
      cost: costN,
      placedInService: placedInService || null,
      usefulLifeYears: Number(life) || 5,
    };
    try {
      const res = await fetch(editing ? `/api/capex/${item!.id}` : '/api/capex', {
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
      <form className="w-full max-w-[480px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-7" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-5">{editing ? 'Edit improvement' : 'Add capital improvement'}</h2>
        {error && <div className="mb-4 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}
        <div className="flex flex-col gap-4">
          <label className={lbl}>Description
            <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. New roof" autoFocus maxLength={200} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={lbl}>Cost
              <input className={field} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="12000" />
            </label>
            <label className={lbl}>Placed in service
              <input className={field} type="date" value={placedInService} onChange={(e) => setPlacedInService(e.target.value)} />
            </label>
            <label className={lbl}>Life (yrs)
              <input className={field} value={life} onChange={(e) => setLife(e.target.value)} inputMode="numeric" placeholder="27" />
            </label>
          </div>
          <p className="text-[11px] text-text-muted">Depreciates straight-line over its useful life (e.g. roof ~27, appliances ~5) into Schedule E line 18.</p>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add improvement'}
          </button>
        </div>
      </form>
    </div>
  );
}
