'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { ICON_CHOICES } from '@/lib/account-types';

export type GroupRow = { key: string; label: string; color: string };
export type TypeRow = {
  slug: string;
  label: string;
  group: string;
  assetClass: 'asset' | 'liability';
  icon: string;
  color: string | null;
  isArchived: boolean;
  isBuiltin: boolean;
  count: number;
};

async function call(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return json.error ? { ok: false, error: json.error.message } : { ok: true };
}

const tint = (c: string) => `color-mix(in srgb, ${c} 18%, transparent)`;

export function SettingsClient({ groups: initialGroups, rows: initialRows }: { groups: GroupRow[]; rows: TypeRow[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState(initialGroups[0]?.key ?? 'banking');
  const [newAsset, setNewAsset] = useState<'asset' | 'liability'>('asset');

  const dragType = useRef<{ slug: string; group: string } | null>(null);
  const dragGroupKey = useRef<string | null>(null);

  const colorOf = (key: string) => groups.find((g) => g.key === key)?.color ?? '#94a3b8';

  function fail(r: { ok: boolean; error?: string }) {
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
  }

  // Structural changes refetch from server; presentational ones update locally.
  async function structural(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong.');
    else router.refresh();
  }

  function patchType(slug: string, body: Record<string, unknown>) {
    setRows((rs) => rs.map((r) => (r.slug === slug ? { ...r, ...body } : r)));
    call(`/api/account-types/${slug}`, 'PATCH', body).then(fail);
  }
  function patchGroup(key: string, body: Record<string, unknown>) {
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...body } : g)));
    call(`/api/account-type-groups/${key}`, 'PATCH', body).then(fail);
  }

  async function addType() {
    if (!newLabel.trim() || busy) return;
    await structural(() => call('/api/account-types', 'POST', { label: newLabel.trim(), group: newGroup, assetClass: newAsset }));
    setNewLabel('');
  }

  // ── Drag: reorder types within a group ──────────────────────────────────
  function dropType(targetSlug: string, group: string) {
    const d = dragType.current;
    dragType.current = null;
    if (!d || d.group !== group || d.slug === targetSlug) return;
    const groupSlugs = rows.filter((r) => r.group === group).map((r) => r.slug);
    const from = groupSlugs.indexOf(d.slug);
    const to = groupSlugs.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    groupSlugs.splice(from, 1);
    groupSlugs.splice(to, 0, d.slug);
    // Rebuild rows: keep non-group rows in place, drop the group's rows in new order.
    const orderIdx = new Map(groupSlugs.map((s, i) => [s, i]));
    setRows((rs) => {
      const next = [...rs];
      next.sort((a, b) => {
        if (a.group !== group || b.group !== group) return 0;
        return (orderIdx.get(a.slug) ?? 0) - (orderIdx.get(b.slug) ?? 0);
      });
      return next;
    });
    call('/api/account-types/reorder', 'POST', { slugs: groupSlugs }).then(fail);
  }

  // ── Drag: reorder groups ────────────────────────────────────────────────
  function dropGroup(targetKey: string) {
    const k = dragGroupKey.current;
    dragGroupKey.current = null;
    if (!k || k === targetKey) return;
    const keys = groups.map((g) => g.key);
    const from = keys.indexOf(k);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(from, 1);
    keys.splice(to, 0, k);
    setGroups((gs) => [...gs].sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key)));
    keys.forEach((key, i) => call(`/api/account-type-groups/${key}`, 'PATCH', { sortOrder: i }).then(fail));
  }

  const visibleRows = (group: string) => rows.filter((r) => r.group === group && (showArchived || !r.isArchived));
  const archivedCount = rows.filter((r) => r.isArchived).length;

  return (
    <section>
      {/* Header + add */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold">Account types</h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            The taxonomy used across Accounts, Net Worth, and uploads. Drag to reorder, recolor groups, pick icons.
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
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-[13px] text-negative">{error}</div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-6 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
        <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Add a type</span>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addType()}
            placeholder="e.g. Money Market, HSA…"
            maxLength={40}
            className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </label>
        <select
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
        >
          {groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <select
          value={newAsset}
          onChange={(e) => setNewAsset(e.target.value as 'asset' | 'liability')}
          className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
        >
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
        <button
          type="button"
          onClick={addType}
          disabled={busy || !newLabel.trim()}
          className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Groups */}
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const groupRows = visibleRows(g.key);
          return (
            <div
              key={g.key}
              className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden"
              style={{ borderLeft: `3px solid ${g.color}` }}
              onDragOver={(e) => dragGroupKey.current && e.preventDefault()}
              onDrop={() => dropGroup(g.key)}
            >
              {/* Group header */}
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: tint(g.color) }}>
                <span
                  draggable
                  onDragStart={() => (dragGroupKey.current = g.key)}
                  className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary select-none"
                  title="Drag to reorder group"
                >
                  ⋮⋮
                </span>
                <input
                  type="color"
                  value={g.color}
                  onChange={(e) => patchGroup(g.key, { color: e.target.value })}
                  className="size-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
                  title="Group color"
                  aria-label={`${g.label} color`}
                />
                <input
                  defaultValue={g.label}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.label && patchGroup(g.key, { label: e.target.value.trim() })}
                  className="flex-1 bg-transparent text-[14px] font-semibold focus:outline-none focus:bg-surface-base/40 rounded px-1.5 py-0.5 -ml-1.5"
                />
                <span className="text-[11px] text-text-tertiary shrink-0">
                  {groupRows.length} {groupRows.length === 1 ? 'type' : 'types'}
                </span>
              </div>

              {/* Types */}
              <div className="flex flex-col">
                {groupRows.map((t) => (
                  <div
                    key={t.slug}
                    draggable
                    onDragStart={() => (dragType.current = { slug: t.slug, group: g.key })}
                    onDragOver={(e) => dragType.current?.group === g.key && e.preventDefault()}
                    onDrop={() => dropType(t.slug, g.key)}
                    className={`group/row relative flex items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle ${t.isArchived ? 'opacity-50' : ''}`}
                  >
                    <span className="cursor-grab active:cursor-grabbing text-text-faint hover:text-text-tertiary select-none text-[13px]" title="Drag to reorder">⋮⋮</span>

                    {/* Icon picker */}
                    <button
                      type="button"
                      onClick={() => setPickerFor((s) => (s === t.slug ? null : t.slug))}
                      className="size-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 hover:ring-1 hover:ring-border-strong transition-shadow"
                      style={{ background: tint(t.color ?? g.color) }}
                      title="Change icon"
                    >
                      {t.icon}
                    </button>
                    {pickerFor === t.slug && (
                      <div className="absolute z-20 left-10 top-12 w-[240px] rounded-xl border border-border-subtle bg-surface-base p-2 shadow-xl grid grid-cols-9 gap-0.5">
                        {ICON_CHOICES.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => { patchType(t.slug, { icon: emoji }); setPickerFor(null); }}
                            className="size-6 rounded flex items-center justify-center text-[15px] hover:bg-surface-2"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <input
                      defaultValue={t.label}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.label && patchType(t.slug, { label: e.target.value.trim() })}
                      className="flex-1 min-w-0 bg-transparent text-[13px] font-medium focus:outline-none focus:bg-surface-2 rounded px-1.5 py-1 -ml-1.5"
                    />

                    <select
                      value={t.assetClass}
                      onChange={(e) => patchType(t.slug, { assetClass: e.target.value })}
                      className="rounded-md border border-border-subtle bg-surface-1 px-2 py-1 text-[12px] focus:outline-none shrink-0"
                    >
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                    </select>

                    <span className="text-[11.5px] text-text-tertiary tabular-nums shrink-0 w-[120px] text-right">
                      {t.count > 0 ? `${t.count} account${t.count === 1 ? '' : 's'}` : '—'}
                      {t.isBuiltin && <span className="ml-2 text-text-faint">built-in</span>}
                    </span>

                    <button
                      type="button"
                      onClick={() => patchType(t.slug, { isArchived: !t.isArchived })}
                      className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors shrink-0 w-[52px] text-left"
                    >
                      {t.isArchived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => structural(() => call(`/api/account-types/${t.slug}`, 'DELETE'))}
                      disabled={busy || t.isBuiltin || t.count > 0}
                      title={t.isBuiltin ? 'Built-in — archive instead' : t.count > 0 ? 'In use — reassign first' : 'Delete'}
                      className="text-text-muted hover:text-negative disabled:opacity-30 disabled:hover:text-text-muted transition-colors shrink-0"
                      aria-label={`Delete ${t.label}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                ))}
                {groupRows.length === 0 && (
                  <div className="px-4 py-3 text-[12.5px] text-text-muted border-t border-border-subtle">No types in this group.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
