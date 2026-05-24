'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ACCOUNT_TYPE_GROUPS, type AccountTypeGroup } from '@/lib/account-types';

export type TypeRow = {
  slug: string;
  label: string;
  group: string;
  assetClass: 'asset' | 'liability';
  isArchived: boolean;
  isBuiltin: boolean;
  count: number;
};

async function api(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return json.error ? { ok: false, error: json.error.message } : { ok: true };
}

export function SettingsClient({ rows }: { rows: TypeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Add-type form
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState<AccountTypeGroup>('banking');
  const [newAsset, setNewAsset] = useState<'asset' | 'liability'>('asset');

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
    else router.refresh();
  }

  async function addType() {
    if (!newLabel.trim() || busy) return;
    await run(() => api('/api/account-types', 'POST', { label: newLabel.trim(), group: newGroup, assetClass: newAsset }));
    setNewLabel('');
  }
  const patch = (slug: string, body: Record<string, unknown>) => run(() => api(`/api/account-types/${slug}`, 'PATCH', body));
  const del = (slug: string) => run(() => api(`/api/account-types/${slug}`, 'DELETE'));

  const visible = showArchived ? rows : rows.filter((r) => !r.isArchived);
  const archivedCount = rows.filter((r) => r.isArchived).length;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <div>
          <h2 className="text-[15px] font-semibold">Account types</h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            The taxonomy used across Accounts, Net Worth, and uploads. Add your own, rename, or archive ones you don’t use.
          </p>
        </div>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors shrink-0"
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
          </button>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-[13px] text-negative">{error}</div>
      )}

      {/* Add type */}
      <div className="flex flex-wrap items-end gap-2 px-5 py-4 border-b border-border-subtle bg-surface-base/40">
        <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">New type</span>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addType()}
            placeholder="e.g. HSA, Brokerage…"
            maxLength={40}
            className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">Group</span>
          <select
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value as AccountTypeGroup)}
            className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          >
            {ACCOUNT_TYPE_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">Class</span>
          <select
            value={newAsset}
            onChange={(e) => setNewAsset(e.target.value as 'asset' | 'liability')}
            className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          >
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
        </label>
        <button
          type="button"
          onClick={addType}
          disabled={busy || !newLabel.trim()}
          className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors"
        >
          Add type
        </button>
      </div>

      {/* Grouped list */}
      <div className="flex flex-col">
        {ACCOUNT_TYPE_GROUPS.map((grp) => {
          const groupRows = visible.filter((r) => r.group === grp.key);
          if (groupRows.length === 0) return null;
          return (
            <div key={grp.key}>
              <div className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">{grp.label}</div>
              {groupRows.map((r) => (
                <div
                  key={r.slug}
                  className={`grid grid-cols-[1fr_120px_110px_120px_40px] gap-3 items-center px-5 py-2.5 border-t border-border-subtle ${r.isArchived ? 'opacity-50' : ''}`}
                >
                  <input
                    defaultValue={r.label}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.label && patch(r.slug, { label: e.target.value.trim() })}
                    className="bg-transparent text-[13px] font-medium focus:outline-none focus:bg-surface-2 rounded px-1.5 py-1 -ml-1.5"
                  />
                  <select
                    value={r.assetClass}
                    onChange={(e) => patch(r.slug, { assetClass: e.target.value })}
                    className="rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-[12px] focus:outline-none"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                  <span className="text-[12px] text-text-tertiary tabular-nums">
                    {r.count > 0 ? `${r.count} account${r.count === 1 ? '' : 's'}` : '—'}
                    {r.isBuiltin && <span className="ml-2 text-text-faint">built-in</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch(r.slug, { isArchived: !r.isArchived })}
                    disabled={busy}
                    className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors text-left"
                  >
                    {r.isArchived ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => del(r.slug)}
                    disabled={busy || r.isBuiltin || r.count > 0}
                    title={r.isBuiltin ? 'Built-in — archive instead' : r.count > 0 ? 'In use — reassign first' : 'Delete'}
                    className="text-text-muted hover:text-negative disabled:opacity-30 disabled:hover:text-text-muted transition-colors justify-self-center"
                    aria-label={`Delete ${r.label}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
