'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { LeaseRow } from '@/lib/properties/leases';

const numOrNull = (s: string): number | null => {
  const t = s.replace(/[$,]/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'vacant', label: 'Vacant' },
] as const;

export function LeaseForm({ propertyId, lease, onClose }: { propertyId: string; lease?: LeaseRow; onClose: () => void }) {
  const router = useRouter();
  const editing = !!lease;
  const [unit, setUnit] = useState(lease?.unit ?? '');
  const [tenantName, setTenantName] = useState(lease?.tenantName ?? '');
  const [tenantContact, setTenantContact] = useState(lease?.tenantContact ?? '');
  const [rent, setRent] = useState(lease?.rentAmount != null ? String(lease.rentAmount) : '');
  const [deposit, setDeposit] = useState(lease?.depositAmount != null ? String(lease.depositAmount) : '');
  const [startDate, setStartDate] = useState(lease?.startDate ?? '');
  const [endDate, setEndDate] = useState(lease?.endDate ?? '');
  const [status, setStatus] = useState(lease?.status ?? 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      propertyId,
      unit: unit.trim() || null,
      tenantName: tenantName.trim() || null,
      tenantContact: tenantContact.trim() || null,
      rentAmount: numOrNull(rent),
      depositAmount: numOrNull(deposit),
      startDate: startDate || null,
      endDate: endDate || null,
      status,
    };
    try {
      const res = await fetch(editing ? `/api/leases/${lease!.id}` : '/api/leases', {
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
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] mb-5">{editing ? 'Edit lease' : 'Add lease'}</h2>
        {error && <div className="mb-4 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl}>Unit <span className="font-normal text-text-muted">(optional)</span>
              <input className={field} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit A" />
            </label>
            <label className={lbl}>Status
              <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <label className={lbl}>Tenant
            <input className={field} value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="Jane Doe" maxLength={160} />
          </label>
          <label className={lbl}>Contact <span className="font-normal text-text-muted">(email / phone)</span>
            <input className={field} value={tenantContact} onChange={(e) => setTenantContact(e.target.value)} placeholder="jane@example.com" maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl}>Monthly rent
              <input className={field} value={rent} onChange={(e) => setRent(e.target.value)} inputMode="decimal" placeholder="2000" />
            </label>
            <label className={lbl}>Deposit
              <input className={field} value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" placeholder="2000" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl}>Lease start
              <input className={field} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className={lbl}>Lease end
              <input className={field} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save lease' : 'Add lease'}
          </button>
        </div>
      </form>
    </div>
  );
}
