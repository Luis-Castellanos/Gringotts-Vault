'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CatLite } from './TransactionsClient';
import type { SplitKind } from '@/lib/transactions/split';

type PropOpt = { id: string; name: string; hasMortgage: boolean };
type PartRow = { kind: SplitKind; label: string; categoryId: string; amount: string };

const KIND_LABEL: Record<SplitKind, string> = {
  principal: 'Principal → mortgage',
  escrow: 'Escrow → escrow account',
  expense: 'Expense',
  transfer: 'Transfer',
};

/** Split a transaction into parts. Pre-fills a principal/interest/escrow
 *  breakdown from the chosen property's amortization schedule. */
export function SplitModal({
  txn,
  categories,
  onClose,
  onDone,
}: {
  txn: { id: string; amount: number; date: string; merchant: string | null };
  categories: CatLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const sign = txn.amount < 0 ? -1 : 1;
  const parentAbs = Math.abs(txn.amount);

  const [props, setProps] = useState<PropOpt[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [parts, setParts] = useState<PartRow[]>([]);
  const [isSplit, setIsSplit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catOptions = useMemo(
    () =>
      categories
        .map((c) => ({ id: c.id, label: c.parentName ? `${c.parentName} › ${c.name}` : c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load property options + any existing splits.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/properties').then((r) => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/transactions/${txn.id}/split`).then((r) => r.json()).catch(() => null),
      ]);
      if (!alive) return;
      setProps(pRes?.data ?? []);
      const existing = sRes?.data?.existing as { categoryId: string | null; amount: string; isTransfer: boolean; label: string | null }[] | undefined;
      if (sRes?.data?.isSplit && existing?.length) {
        setIsSplit(true);
        setParts(existing.map((e) => ({
          kind: e.isTransfer ? 'transfer' : 'expense',
          label: e.label ?? '',
          categoryId: e.categoryId ?? '',
          amount: Math.abs(Number(e.amount)).toFixed(2),
        })));
      }
    })();
    return () => { alive = false; };
  }, [txn.id]);

  async function propose(pid: string) {
    setPropertyId(pid);
    if (!pid) return;
    setError(null);
    const res = await fetch(`/api/transactions/${txn.id}/split?propertyId=${pid}`).then((r) => r.json()).catch(() => null);
    if (res?.data?.proposalError) { setError(res.data.proposalError); return; }
    const proposal = res?.data?.proposal as { kind: SplitKind; label: string; amount: number }[] | null;
    if (proposal?.length) {
      setParts(proposal.map((p) => ({
        kind: p.kind,
        label: p.label,
        categoryId: '',
        amount: Math.abs(p.amount).toFixed(2),
      })));
    }
  }

  const sum = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanced = Math.abs(sum - parentAbs) < 0.01;

  const update = (i: number, patch: Partial<PartRow>) =>
    setParts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addRow = () => setParts((ps) => [...ps, { kind: 'expense', label: '', categoryId: '', amount: '' }]);
  const removeRow = (i: number) => setParts((ps) => ps.filter((_, idx) => idx !== i));

  async function save() {
    if (!balanced) { setError(`Parts must sum to $${parentAbs.toFixed(2)}.`); return; }
    setSaving(true);
    setError(null);
    const body = {
      propertyId: propertyId || null,
      parts: parts.map((p) => ({
        kind: p.kind,
        categoryId: p.categoryId || null,
        amount: sign * (Number(p.amount) || 0),
        label: p.label || null,
      })),
    };
    const res = await fetch(`/api/transactions/${txn.id}/split`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || json.error) { setError(json?.error?.message ?? `HTTP ${res.status}`); return; }
    router.refresh();
    onDone();
  }

  async function unsplit() {
    setSaving(true);
    await fetch(`/api/transactions/${txn.id}/split`, { method: 'DELETE' });
    setSaving(false);
    router.refresh();
    onDone();
  }

  const field = 'rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:border-accent-500';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 py-10" onClick={onClose}>
      <div className="w-full max-w-[640px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[18px] font-semibold mb-1">Split transaction</h2>
        <p className="text-[12.5px] text-text-tertiary mb-4">
          {txn.merchant ?? 'Transaction'} · ${parentAbs.toFixed(2)} · {txn.date}
        </p>
        {error && <div className="mb-3 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}

        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary mb-4">
          Mortgage payment for property
          <select className={field} value={propertyId} onChange={(e) => propose(e.target.value)}>
            <option value="">— Manual split (no property) —</option>
            {props.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.hasMortgage}>
                {p.name}{p.hasMortgage ? '' : ' (no mortgage linked)'}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-text-muted font-normal">Picking a property pre-fills principal / interest / escrow from its amortization schedule.</span>
        </label>

        <div className="flex flex-col gap-2 mb-3">
          <div className="grid grid-cols-[130px_1fr_110px_28px] gap-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted px-1">
            <span>Part</span><span>Category</span><span className="text-right">Amount</span><span />
          </div>
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[130px_1fr_110px_28px] gap-2 items-center">
              <select className={field} value={p.kind} onChange={(e) => update(i, { kind: e.target.value as SplitKind })}>
                {(['expense', 'principal', 'escrow', 'transfer'] as SplitKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <select className={field} value={p.categoryId} onChange={(e) => update(i, { categoryId: e.target.value })}>
                <option value="">{p.kind === 'principal' || p.kind === 'escrow' ? '(transfer — no category)' : 'Uncategorized'}</option>
                {catOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <input className={`${field} text-right tabular-nums`} value={p.amount} inputMode="decimal" placeholder="0.00" onChange={(e) => update(i, { amount: e.target.value })} />
              <button type="button" className="text-text-muted hover:text-negative text-[16px]" onClick={() => removeRow(i)} aria-label="Remove part">×</button>
            </div>
          ))}
          <button type="button" className="self-start text-[12.5px] text-accent-300 hover:underline mt-1" onClick={addRow}>+ Add part</button>
        </div>

        <div className={`flex justify-between text-[13px] tabular-nums px-1 py-2 border-t border-border-subtle ${balanced ? 'text-text-tertiary' : 'text-amber-400'}`}>
          <span>Sum of parts</span>
          <span>${sum.toFixed(2)} / ${parentAbs.toFixed(2)}{balanced ? ' ✓' : ''}</span>
        </div>

        <div className="flex justify-between items-center mt-5">
          {isSplit ? (
            <button type="button" className="text-[13px] text-negative hover:underline" disabled={saving} onClick={unsplit}>Remove split</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving || !balanced} onClick={save}>
              {saving ? 'Saving…' : 'Save split'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
