'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { MaintenanceRow } from '@/lib/properties/maintenance';

const numOrNull = (s: string): number | null => {
  const t = s.replace(/[$,]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const;

export function MaintenanceForm({ propertyId, item, onClose }: { propertyId: string; item?: MaintenanceRow; onClose: () => void }) {
  const router = useRouter();
  const editing = !!item;
  const [title, setTitle] = useState(item?.title ?? '');
  const [status, setStatus] = useState(item?.status ?? 'open');
  const [category, setCategory] = useState(item?.category ?? '');
  const [vendor, setVendor] = useState(item?.vendor ?? '');
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : '');
  const [openedAt, setOpenedAt] = useState(item?.openedAt ?? new Date().toISOString().slice(0, 10));
  const [completedAt, setCompletedAt] = useState(item?.completedAt ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('A title is required.'); return; }
    setSaving(true);
    setError(null);
    const body = {
      propertyId,
      title: title.trim(),
      status,
      category: category.trim() || null,
      vendor: vendor.trim() || null,
      cost: numOrNull(cost),
      openedAt: openedAt || null,
      completedAt: completedAt || null,
      notes: notes.trim() || null,
    };
    try {
      const res = await fetch(editing ? `/api/maintenance/${item!.id}` : '/api/maintenance', {
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
      <form className="w-full max-w-[540px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-7" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-5">{editing ? 'Edit work order' : 'New work order'}</h2>
        {error && <div className="mb-4 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}

        <div className="flex flex-col gap-4">
          <label className={lbl}>Title
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace hyperdrive" autoFocus maxLength={200} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={lbl}>Status
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className={lbl}>Category
              <input className={field} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Droid repair" maxLength={60} />
            </label>
            <label className={lbl}>Cost
              <input className={field} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="327" />
            </label>
          </div>
          <label className={lbl}>Vendor <span className="font-normal text-text-muted">(optional)</span>
            <input className={field} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Tosche Station" maxLength={160} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl}>Opened
              <input className={field} type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} />
            </label>
            <label className={lbl}>Completed
              <input className={field} type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} min={openedAt || undefined} />
            </label>
          </div>
          <label className={lbl}>Notes <span className="font-normal text-text-muted">(optional)</span>
            <textarea className={field} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add work order'}
          </button>
        </div>
      </form>
    </div>
  );
}
