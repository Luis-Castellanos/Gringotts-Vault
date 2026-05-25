'use client';

import { useState } from 'react';

export function MaintenancePanel() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reclean() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/transactions/reclean', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (j?.data) setMsg(`Re-cleaned ${j.data.updated} of ${j.data.scanned} transactions.`);
      else setMsg(j?.error?.message ?? 'Could not re-clean.');
    } catch {
      setMsg('Could not re-clean.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mt-8">
      <h2 className="text-[15px] font-semibold mb-1">Data maintenance</h2>
      <p className="text-[12.5px] text-text-tertiary mb-4">
        Re-run the merchant cleaner over every transaction (after improving the rules). Only rows whose cleaned name changes are updated.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reclean}
          disabled={busy}
          className="rounded-lg border border-border-subtle hover:bg-surface-2 disabled:opacity-50 text-text-secondary text-[13px] font-medium px-4 py-2 transition-colors"
        >
          {busy ? 'Re-cleaning…' : 'Re-clean merchant names'}
        </button>
        {msg && <span className="text-[12px] text-text-tertiary">{msg}</span>}
      </div>
    </section>
  );
}
