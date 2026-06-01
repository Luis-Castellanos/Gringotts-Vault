'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CategoryIcon } from '@/components/CategoryIcon';
import { VendorLogo } from '@/components/VendorLogo';

export type MerchantCategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  color: string | null;
};

export type MerchantRow = {
  merchant: string;
  transactionCount: number;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryName: string | null;
  categoryColor: string | null;
  source: string | null;
};

type SortId = 'count' | 'name' | 'category';

function categoryLabel(row: MerchantRow): string {
  if (!row.categoryName) return 'No default category';
  return row.parentCategoryName ? `${row.parentCategoryName} / ${row.categoryName}` : row.categoryName;
}

function optionLabel(cat: MerchantCategoryOption): string {
  return cat.parentName ? `${cat.parentName} / ${cat.name}` : cat.name;
}

async function patchMerchant(body: {
  merchant: string;
  nextMerchant: string;
  categoryId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/merchants', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
  return { ok: true };
}

export function MerchantSettings({
  initialRows,
  categories,
}: {
  initialRows: MerchantRow[];
  categories: MerchantCategoryOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortId>('count');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${r.merchant} ${categoryLabel(r)}`.toLowerCase().includes(q))
      : rows;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.merchant.localeCompare(b.merchant);
      if (sortBy === 'category') return categoryLabel(a).localeCompare(categoryLabel(b)) || a.merchant.localeCompare(b.merchant);
      return b.transactionCount - a.transactionCount || a.merchant.localeCompare(b.merchant);
    });
  }, [query, rows, sortBy]);

  function beginEdit(row: MerchantRow) {
    setError(null);
    setEditing(row.merchant);
    setDraftName(row.merchant);
    setDraftCategoryId(row.categoryId ?? '');
  }

  async function save(row: MerchantRow) {
    const nextMerchant = draftName.trim();
    if (!nextMerchant || saving) return;
    setSaving(true);
    setError(null);
    const categoryId = draftCategoryId || null;
    const result = await patchMerchant({ merchant: row.merchant, nextMerchant, categoryId });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const cat = categoryId ? categoryById.get(categoryId) : null;
    setRows((current) =>
      current.map((r) =>
        r.merchant === row.merchant
          ? {
              ...r,
              merchant: nextMerchant,
              categoryId,
              categoryName: cat?.name ?? null,
              parentCategoryName: cat?.parentName ?? null,
              categoryColor: cat?.color ?? null,
              source: categoryId ? 'manual' : null,
            }
          : r,
      ),
    );
    setEditing(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Merchants</h2>
          </div>
          <div className="text-[12px] font-medium text-text-tertiary tabular-nums">
            {rows.length.toLocaleString()} merchants
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortId)}
            className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] font-medium text-text-secondary focus:outline-none focus:border-border-strong"
            aria-label="Sort merchants"
          >
            <option value="count">Transaction count</option>
            <option value="name">Merchant name</option>
            <option value="category">Default category</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${rows.length.toLocaleString()} merchants...`}
            className="min-w-[260px] flex-1 rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong md:max-w-[360px]"
          />
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-[12.5px] text-negative">
            {error}
          </div>
        )}
      </div>

      <div className="divide-y divide-border-subtle">
        {visible.map((row) => {
          const isEditing = editing === row.merchant;
          return (
            <div key={row.merchant} className="px-5 py-4">
              <div className="flex items-center gap-4">
                <VendorLogo merchant={row.merchant} size={42} />
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)]">
                      <input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-border-strong"
                        maxLength={200}
                        autoFocus
                      />
                      <select
                        value={draftCategoryId}
                        onChange={(e) => setDraftCategoryId(e.target.value)}
                        className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-border-strong"
                      >
                        <option value="">No default category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{optionLabel(cat)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div className="truncate text-[15px] font-semibold text-text-primary">{row.merchant}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-text-tertiary">
                        <span className="font-medium text-accent-300">{row.transactionCount.toLocaleString()} transactions</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <CategoryIcon name={row.categoryName ?? 'Uncategorized'} color={row.categoryColor} size={18} />
                          <span className="truncate">{categoryLabel(row)}</span>
                        </span>
                        {row.source && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-muted">{row.source}</span>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => save(row)}
                        disabled={saving || !draftName.trim()}
                        className="rounded-lg bg-accent-500 px-3.5 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => beginEdit(row)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-semibold text-text-secondary transition hover:bg-surface-2 hover:text-text-primary"
                    >
                      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M10.5 3.5 14.5 7.5M3 15l3.8-.8 8.1-8.1a1.7 1.7 0 0 0-2.4-2.4L4.4 11.8 3 15Z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-text-tertiary">No merchants match that search.</div>
        )}
      </div>
    </section>
  );
}
