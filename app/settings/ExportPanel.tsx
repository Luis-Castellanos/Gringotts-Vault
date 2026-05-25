'use client';

import { useState } from 'react';

const COLS = [
  { key: 'date', label: 'Date' },
  { key: 'account', label: 'Account' },
  { key: 'accountNumber', label: 'Account #' },
  { key: 'source', label: 'Source' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'type', label: 'Type' },
  { key: 'category', label: 'Category' },
  { key: 'subcategory', label: 'Sub-category' },
  { key: 'amount', label: 'Amount' },
  { key: 'period', label: 'Stmt period' },
  { key: 'sourceFile', label: 'Source file' },
];

export function ExportPanel() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [transfers, setTransfers] = useState(true);
  const [cols, setCols] = useState<Set<string>>(new Set(COLS.map((c) => c.key)));

  function toggle(k: string) {
    setCols((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function exportXlsx() {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('transfers', transfers ? 'include' : 'exclude');
    if (cols.size > 0 && cols.size < COLS.length) p.set('cols', COLS.filter((c) => cols.has(c.key)).map((c) => c.key).join(','));
    window.location.href = `/api/export/transactions?${p.toString()}`;
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mt-6">
      <h2 className="text-[15px] font-semibold mb-1">Export to Excel</h2>
      <p className="text-[12.5px] text-text-tertiary mb-4">Download your transactions as an .xlsx — pick a date range, columns, and whether to include transfers.</p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text-secondary pb-2">
          <input type="checkbox" checked={transfers} onChange={(e) => setTransfers(e.target.checked)} style={{ accentColor: 'var(--color-accent-500)' }} />
          Include transfers
        </label>
      </div>

      <div className="mb-4">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Columns</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1.5">
          {COLS.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 text-[13px] text-text-secondary">
              <input type="checkbox" checked={cols.has(c.key)} onChange={() => toggle(c.key)} style={{ accentColor: 'var(--color-accent-500)' }} />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={exportXlsx}
        disabled={cols.size === 0}
        className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors"
      >
        Export .xlsx
      </button>
    </section>
  );
}
