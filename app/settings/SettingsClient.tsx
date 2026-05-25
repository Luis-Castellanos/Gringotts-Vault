'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { ICON_CHOICES } from '@/lib/account-types';
import { Select } from '@/components/Select';

const ASSET_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
];

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

const tint = (c: string, pct = 18) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

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

  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) setError(r.error ?? 'Something went wrong.'); };

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
    const orderIdx = new Map(groupSlugs.map((s, i) => [s, i]));
    setRows((rs) =>
      [...rs].sort((a, b) => (a.group === group && b.group === group ? (orderIdx.get(a.slug) ?? 0) - (orderIdx.get(b.slug) ?? 0) : 0)),
    );
    call('/api/account-types/reorder', 'POST', { slugs: groupSlugs }).then(fail);
  }

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

  const archivedCount = rows.filter((r) => r.isArchived).length;
  const inClass = (cls: 'asset' | 'liability') =>
    groups
      .map((g) => ({ g, types: rows.filter((r) => r.group === g.key && r.assetClass === cls && (showArchived || !r.isArchived)) }))
      .filter((x) => x.types.length > 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-semibold">Account types</h2>
          <p className="text-[12.5px] text-text-tertiary mt-0.5">
            Your taxonomy across Accounts, Net Worth, and uploads. Drag to reorder, recolor groups, pick icons; the asset/liability toggle moves a type between the two sections.
          </p>
        </div>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="text-[12px] text-text-secondary hover:text-text-primary transition-colors shrink-0"
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-2.5 text-[13px] text-negative">{error}</div>
      )}

      {/* Add a type */}
      <div className="flex flex-wrap items-end gap-2.5 mb-7 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3.5">
        <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
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
        <Select value={newGroup} onChange={setNewGroup} options={groups.map((g) => ({ value: g.key, label: g.label }))} ariaLabel="Group" />
        <Select value={newAsset} onChange={(v) => setNewAsset(v as 'asset' | 'liability')} options={ASSET_OPTIONS} ariaLabel="Asset class" />
        <button type="button" onClick={addType} disabled={busy || !newLabel.trim()} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
          Add
        </button>
      </div>

      {/* Asset / Liability super-parents */}
      {(['asset', 'liability'] as const).map((cls) => {
        const sections = inClass(cls);
        if (sections.length === 0) return null;
        const typeCount = sections.reduce((s, x) => s + x.types.length, 0);
        return (
          <div key={cls} className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{cls === 'asset' ? 'Assets' : 'Liabilities'}</h3>
              <span className="text-[12px] text-text-tertiary tabular-nums">{typeCount} {typeCount === 1 ? 'type' : 'types'}</span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>

            <div className="flex flex-col gap-3.5">
              {sections.map(({ g, types }) => (
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
                      className="cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary select-none leading-none"
                      title="Drag to reorder group"
                    >⋮⋮</span>
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
                      key={g.label}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.label && patchGroup(g.key, { label: e.target.value.trim() })}
                      className="flex-1 bg-transparent text-[14px] font-semibold text-text-primary focus:outline-none focus:bg-surface-base/50 rounded px-1.5 py-0.5 -ml-1.5"
                    />
                    <span className="text-[11.5px] font-medium text-text-secondary shrink-0">
                      {types.length} {types.length === 1 ? 'type' : 'types'}
                    </span>
                  </div>

                  {/* Types */}
                  <div className="flex flex-col">
                    {types.map((t) => (
                      <div
                        key={t.slug}
                        draggable
                        onDragStart={() => (dragType.current = { slug: t.slug, group: g.key })}
                        onDragOver={(e) => dragType.current?.group === g.key && e.preventDefault()}
                        onDrop={() => dropType(t.slug, g.key)}
                        className={`relative flex items-center gap-3 px-4 py-3 border-t border-border-subtle ${t.isArchived ? 'opacity-60' : ''}`}
                      >
                        <span className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary select-none leading-none" title="Drag to reorder">⋮⋮</span>

                        <button
                          type="button"
                          onClick={() => setPickerFor((s) => (s === t.slug ? null : t.slug))}
                          className="size-9 rounded-lg flex items-center justify-center text-[17px] shrink-0 ring-1 ring-transparent hover:ring-border-strong transition-shadow"
                          style={{ background: tint(t.color ?? g.color, 22) }}
                          title="Change icon"
                        >
                          {t.icon}
                        </button>
                        {pickerFor === t.slug && (
                          <div className="absolute z-20 left-12 top-14 w-[252px] rounded-xl border border-border-subtle bg-surface-base p-2 shadow-xl grid grid-cols-9 gap-0.5">
                            {ICON_CHOICES.map((emoji) => (
                              <button key={emoji} type="button" onClick={() => { patchType(t.slug, { icon: emoji }); setPickerFor(null); }} className="size-6 rounded flex items-center justify-center text-[15px] hover:bg-surface-2">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        <input
                          defaultValue={t.label}
                          key={t.label}
                          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.label && patchType(t.slug, { label: e.target.value.trim() })}
                          className="flex-1 min-w-0 bg-transparent text-[14px] font-medium focus:outline-none focus:bg-surface-2 rounded px-1.5 py-1 -ml-1.5"
                        />

                        <Select
                          value={t.assetClass}
                          onChange={(v) => patchType(t.slug, { assetClass: v })}
                          options={ASSET_OPTIONS}
                          className="vsel-sm shrink-0"
                          ariaLabel="Asset class"
                        />

                        {/* Right cluster — prominent, comfortable */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[12.5px] text-text-secondary tabular-nums w-[88px] text-right">
                            {t.count > 0 ? `${t.count} ${t.count === 1 ? 'account' : 'accounts'}` : '—'}
                          </span>
                          {t.isBuiltin && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary bg-surface-2 border border-border-subtle rounded px-1.5 py-0.5">
                              Built-in
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => patchType(t.slug, { isArchived: !t.isArchived })}
                            className="text-[12px] font-medium text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 rounded-md px-2.5 py-1 transition-colors w-[68px]"
                          >
                            {t.isArchived ? 'Restore' : 'Archive'}
                          </button>
                          <button
                            type="button"
                            onClick={() => structural(() => call(`/api/account-types/${t.slug}`, 'DELETE'))}
                            disabled={busy || t.isBuiltin || t.count > 0}
                            title={t.isBuiltin ? 'Built-in — archive instead' : t.count > 0 ? 'In use — reassign first' : 'Delete'}
                            className="size-7 rounded-md flex items-center justify-center text-text-tertiary hover:text-negative hover:bg-negative/10 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-tertiary transition-colors"
                            aria-label={`Delete ${t.label}`}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
