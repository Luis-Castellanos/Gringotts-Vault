'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { VendorLogo } from '@/components/VendorLogo';
import { iconBg, iconFor } from '@/lib/categories/icons';

// ─── Types ────────────────────────────────────────────────────────────────
export type TxnRow = {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  rawDescription: string;
  isTransfer: boolean;
  needsReview: boolean;
  notes: string | null;
  accountId: string | null;
  accountName: string;
  accountInstitution: string;
  accountLast4: string;
  accountType: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIsIncome: boolean;
};

export type AcctLite = { id: string; name: string; institution: string };
export type CatLite = {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
};

// ─── Filter state ─────────────────────────────────────────────────────────
type DateRangeId = '7' | '30' | '90' | 'ytd' | '365' | 'all' | 'custom';

type Filters = {
  search: string;
  dateRange: DateRangeId;
  customFrom: string;
  customTo: string;
  accountIds: string[];
  categoryIds: string[]; // includes '__uncategorized__'
  merchants: string[];
  amountMin: string;
  amountMax: string;
  hideTransfers: boolean;
  needsReviewOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  search: '',
  dateRange: 'all',
  customFrom: '',
  customTo: '',
  accountIds: [],
  categoryIds: [],
  merchants: [],
  amountMin: '',
  amountMax: '',
  hideTransfers: false,
  needsReviewOnly: false,
};

const SORT_OPTIONS = [
  { id: 'date-desc', label: 'Date · newest' },
  { id: 'date-asc', label: 'Date · oldest' },
  { id: 'amount-high', label: 'Amount · high to low' },
  { id: 'amount-low', label: 'Amount · low to high' },
  { id: 'merchant', label: 'Merchant (A→Z)' },
] as const;
type SortId = (typeof SORT_OPTIONS)[number]['id'];

const DATE_PRESETS: { id: DateRangeId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: '90', label: 'Last 90 days' },
  { id: 'ytd', label: 'Year to date' },
  { id: '365', label: 'Last 12 months' },
  { id: 'custom', label: 'Custom range' },
];

const INSTITUTION_DOMAINS: Record<string, string> = {
  'Chase': 'chase.com',
  'Ally Bank': 'ally.com',
  'Capital One': 'capitalone.com',
  'Bank of America': 'bankofamerica.com',
  'U.S. Bank': 'usbank.com',
  'Goldman Sachs / Apple': 'apple.com',
  'Apple / Goldman Sachs': 'apple.com',
  'Apple / Green Dot Bank': 'apple.com',
  'Fidelity': 'fidelity.com',
  'American Express': 'americanexpress.com',
  'Charles Schwab': 'schwab.com',
  'Citi': 'citi.com',
  'Discover': 'discover.com',
  'Synchrony Bank / Venmo': 'venmo.com',
  'Gain Federal Credit Union': 'gainfcu.com',
};

// ─── Helpers ──────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

function fmtMoney(n: number, { sign = false }: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const prefix = sign && n > 0 ? '+' : n < 0 ? '−' : '';
  return prefix + '$' + abs.toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(/[\s\-*&]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function instDomain(institution: string | null | undefined): string | null {
  if (!institution) return null;
  if (INSTITUTION_DOMAINS[institution]) return INSTITUTION_DOMAINS[institution]!;
  return institution.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

function rangeStartISO(range: DateRangeId): string | null {
  if (range === 'all' || range === 'custom') return null;
  const today = new Date(TODAY + 'T00:00:00');
  if (range === 'ytd') {
    return new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }
  const days = Number(range);
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  return start.toISOString().slice(0, 10);
}

// Count active filters (drives the badge on the Filters button)
function activeFilterCount(f: Filters): number {
  let n = 0;
  if (f.accountIds.length > 0) n++;
  if (f.categoryIds.length > 0) n++;
  if (f.merchants.length > 0) n++;
  if (f.amountMin || f.amountMax) n++;
  if (f.dateRange !== 'all') n++;
  if (f.hideTransfers) n++;
  if (f.needsReviewOnly) n++;
  return n;
}

// Serialize filters + sort + paging into the query string consumed by
// GET /api/transactions. Date presets are resolved to concrete from/to here so
// the server stays preset-agnostic. Multi-value fields are repeated params
// (merchant names can contain commas, so joining isn't safe).
function buildTxnQuery(f: Filters, sort: SortId): string {
  const p = new URLSearchParams();
  // No offset/limit — the page loads every matching row in one request.
  p.set('sort', sort);
  const q = f.search.trim();
  if (q) p.set('q', q);
  const startISO = f.dateRange === 'custom' ? f.customFrom || null : rangeStartISO(f.dateRange);
  const endISO = f.dateRange === 'custom' ? f.customTo || null : null;
  if (startISO) p.set('from', startISO);
  if (endISO) p.set('to', endISO);
  for (const a of f.accountIds) p.append('account', a);
  for (const c of f.categoryIds) p.append('cat', c);
  for (const m of f.merchants) p.append('merchant', m);
  if (f.amountMin) p.set('amin', f.amountMin);
  if (f.amountMax) p.set('amax', f.amountMax);
  if (f.hideTransfers) p.set('hideTransfers', '1');
  if (f.needsReviewOnly) p.set('needsReview', '1');
  return p.toString();
}

type TxnPatch = {
  merchant: string;
  categoryId: string;
  notes: string;
  isTransfer: boolean;
  needsReview: boolean;
};

// Saved views (filter + sort presets), persisted to localStorage.
type SavedView = { id: string; name: string; filters: Filters; sortBy: SortId };
const VIEWS_KEY = 'transactions:views:v1';

// ─── Save helpers ─────────────────────────────────────────────────────────
type SaveResult = { ok: true } | { ok: false; error: string };

async function patchTxn(id: string, body: Record<string, unknown>): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

async function categorizeTxn(
  id: string,
  body: { categoryId: string; isTransfer?: boolean; notes?: string },
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/transactions/${id}/categorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

async function deleteTxn(id: string): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || json.error) return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Inline expansion: edit a single transaction ─────────────────────────
function TxnDetail({
  txn, categories, onSaved, onDeleted, onViewMerchant,
}: {
  txn: TxnRow;
  categories: CatLite[];
  onSaved: (patch: TxnPatch) => void;
  onDeleted: () => void;
  onViewMerchant: (merchant: string) => void;
}) {
  const [merchant, setMerchant] = useState(txn.merchant);
  const [categoryId, setCategoryId] = useState<string>(txn.categoryId ?? '');
  const [notes, setNotes] = useState(txn.notes ?? '');
  const [isTransfer, setIsTransfer] = useState(txn.isTransfer);
  const [needsReview, setNeedsReview] = useState(txn.needsReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catPickerAt, setCatPickerAt] = useState<Anchor | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cat = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;
  const catLabel = cat ? (cat.parentName ? `${cat.parentName} → ${cat.name}` : cat.name) : 'Uncategorized';
  const isPositive = txn.amount > 0;

  const dirty =
    merchant !== txn.merchant ||
    categoryId !== (txn.categoryId ?? '') ||
    notes !== (txn.notes ?? '') ||
    isTransfer !== txn.isTransfer ||
    needsReview !== txn.needsReview;

  async function save() {
    setSaving(true);
    setError(null);
    const patchBody: Record<string, unknown> = {};
    if (merchant !== txn.merchant) patchBody.merchant = merchant.trim();
    if (notes !== (txn.notes ?? '')) patchBody.notes = notes;
    if (isTransfer !== txn.isTransfer) patchBody.isTransfer = isTransfer;
    if (needsReview !== txn.needsReview) patchBody.needsReview = needsReview;
    if (Object.keys(patchBody).length > 0) {
      const r = await patchTxn(txn.id, patchBody);
      if (!r.ok) { setSaving(false); setError(r.error); return; }
    }
    if (categoryId && categoryId !== (txn.categoryId ?? '')) {
      const r = await categorizeTxn(txn.id, { categoryId, isTransfer, notes });
      if (!r.ok) { setSaving(false); setError(r.error); return; }
    }
    setSaving(false);
    onSaved({ merchant: merchant.trim(), categoryId, notes, isTransfer, needsReview });
  }

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(txn.rawDescription);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function remove() {
    setSaving(true);
    const r = await deleteTxn(txn.id);
    if (!r.ok) { setSaving(false); setError(r.error); setConfirmDelete(false); return; }
    onDeleted();
  }

  return (
    <div className="tx-expand-content" onClick={(e) => e.stopPropagation()}>
      {/* Header: vendor + amount/account/date */}
      <div className="txd-head">
        <VendorLogo merchant={merchant || txn.merchant} size={40} />
        <div className="txd-id">
          <div className="txd-vendor">{merchant || txn.merchant}</div>
          <button type="button" className="txd-viewall" onClick={() => onViewMerchant(txn.merchant)}>
            View all transactions from this merchant →
          </button>
        </div>
        <div className="txd-meta">
          <div className={'txd-amount' + (isPositive && !isTransfer ? ' pos' : '')}>
            {fmtMoney(txn.amount, { sign: isPositive })}
          </div>
          <div className="txd-acct">
            <AccountLogo institution={txn.accountInstitution} size={16} />
            {txn.accountName}{txn.accountLast4 ? ` ····${txn.accountLast4}` : ''}
          </div>
          <div className="txd-date">{fmtDateShort(txn.date)}</div>
        </div>
      </div>

      {/* Original statement (the raw source text) */}
      <div className="txd-orig">
        <span className="txd-orig-label">Original statement</span>
        <span className="txd-orig-text">{txn.rawDescription}</span>
        <button type="button" className="txd-copy" onClick={copyRaw} title="Copy original statement">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="tx-form-grid">
        <label>
          Merchant
          <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={200} />
        </label>
        <div className="txd-field">
          <span className="txd-field-label">Category</span>
          <button
            type="button"
            className="txd-cat-btn"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setCatPickerAt({ x: Math.min(r.left, window.innerWidth - 264), y: r.bottom + 4 });
            }}
          >
            <span className="ic" style={{ background: iconBg(cat?.color ?? null) }}>{iconFor(cat?.name ?? 'Uncategorized')}</span>
            <span className="nm">{catLabel}</span>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="chev">
              <path d="M3.5 5l3.5 3.5L10.5 5" />
            </svg>
          </button>
          {catPickerAt && (
            <CategoryPicker
              categories={categories}
              currentId={categoryId || null}
              anchor={catPickerAt}
              onPick={(cid) => { setCategoryId(cid); setCatPickerAt(null); }}
              onClose={() => setCatPickerAt(null)}
            />
          )}
        </div>
        <div className="txd-field">
          <span className="txd-field-label">Date</span>
          <div className="txd-static">{fmtDateShort(txn.date)}</div>
        </div>
        <label className="span-3">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember about this transaction…" maxLength={1000} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={isTransfer} onChange={(e) => setIsTransfer(e.target.checked)} />
          Mark as transfer (excluded from spending / income)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          {needsReview ? 'In review queue' : 'Send back to review queue'}
        </label>
      </div>

      <div className="tx-actions">
        {error && <span className="err">{error}</span>}
        {confirmDelete ? (
          <span className="txd-confirm">
            Delete this transaction?
            <button type="button" className="txd-delete" disabled={saving} onClick={remove}>Yes, delete</button>
            <button type="button" className="pg-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="txd-delete-link" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
        <button type="button" className="pg-btn primary" disabled={saving || !dirty} onClick={save}>
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Account logo (favicon-based) ─────────────────────────────────────────
function AccountLogo({ institution, size = 22 }: { institution: string; size?: number }) {
  const domain = instDomain(institution);
  const [failed, setFailed] = useState(false);
  if (!domain || failed) {
    return (
      <span className="vendor-logo" style={{ width: size, height: size }}>
        <span className="vendor-logo-initials" style={{
          background: 'var(--surface-elev)',
          color: 'var(--text-2)',
          fontSize: Math.round(size * 0.45),
        }}>{initials(institution || '?')}</span>
      </span>
    );
  }
  return (
    <span className="vendor-logo" style={{ width: size, height: size }}>
      <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt={institution} onError={() => setFailed(true)} width={size} height={size}
        style={{ width: Math.round(size * 0.7), height: Math.round(size * 0.7) }} />
    </span>
  );
}

// ─── Filter Panel (Monarch-style multi-tab modal) ─────────────────────────
type FilterTab = 'categories' | 'merchants' | 'accounts' | 'date' | 'amount' | 'other';

function FilterPanel({
  onClose, filters, setFilters,
  categories, accounts, allMerchants, hideAccounts = false,
}: {
  onClose: () => void;
  filters: Filters;
  setFilters: (next: Filters) => void;
  categories: CatLite[];
  accounts: AcctLite[];
  allMerchants: string[];
  hideAccounts?: boolean;
}) {
  const [tab, setTab] = useState<FilterTab>('categories');
  const [catSearch, setCatSearch] = useState('');
  const [merchSearch, setMerchSearch] = useState('');
  const [acctSearch, setAcctSearch] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const total = activeFilterCount(filters);

  function toggleArr(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  // Group categories by parent for hierarchical display
  const grouped = useMemo(() => {
    const map = new Map<string | null, CatLite[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const topLevel = categories.filter((c) => c.parentId === null);
    return { topLevel, byParent: map };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.parentName ?? '').toLowerCase().includes(q),
    );
  }, [categories, catSearch]);

  const filteredMerchants = useMemo(() => {
    const q = merchSearch.trim().toLowerCase();
    if (!q) return allMerchants;
    return allMerchants.filter((m) => m.toLowerCase().includes(q));
  }, [allMerchants, merchSearch]);

  const filteredAccounts = useMemo(() => {
    const q = acctSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(q) || a.institution.toLowerCase().includes(q),
    );
  }, [accounts, acctSearch]);

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className="filter-panel" onClick={(e) => e.stopPropagation()}>
          <div className="filter-header">
            <span className="title">Filters</span>
            <span className="count">
              <strong>{total}</strong> {total === 1 ? 'filter' : 'filters'} selected
            </span>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="filter-body">
            <aside className="filter-tabs">
              {([
                ['categories', 'Categories', filters.categoryIds.length],
                ['merchants', 'Merchants', filters.merchants.length],
                ['accounts', 'Accounts', filters.accountIds.length],
                ['date', 'Date', filters.dateRange !== 'all' ? 1 : 0],
                ['amount', 'Amount', filters.amountMin || filters.amountMax ? 1 : 0],
                ['other', 'Other', (filters.hideTransfers ? 1 : 0) + (filters.needsReviewOnly ? 1 : 0)],
              ] as const)
                .filter(([id]) => !(hideAccounts && id === 'accounts'))
                .map(([id, label, count]) => (
                <button
                  type="button"
                  key={id}
                  className={'filter-tab' + (tab === id ? ' active' : '')}
                  onClick={() => setTab(id as FilterTab)}
                >
                  <span>{label}</span>
                  {count > 0 && <span className="tab-count">{count}</span>}
                </button>
              ))}
            </aside>

            <div className="filter-content">
              {tab === 'categories' && (
                <>
                  <div className="filter-search">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="4" /><path d="M9.5 9.5L12 12" />
                    </svg>
                    <input type="search" placeholder="Search categories…"
                      value={catSearch} onChange={(e) => setCatSearch(e.target.value)} />
                  </div>
                  <div className="filter-list">
                    <label className="filter-option">
                      <input type="checkbox"
                        checked={filters.categoryIds.includes('__uncategorized__')}
                        onChange={() => setFilters({
                          ...filters,
                          categoryIds: toggleArr(filters.categoryIds, '__uncategorized__'),
                        })} />
                      <span className="swatch" style={{
                        background: 'var(--surface-elev)',
                        border: '1px dashed var(--text-3)',
                      }} />
                      <span className="lbl">Uncategorized</span>
                    </label>
                    {catSearch ? (
                      // Flat list when searching
                      filteredCategories.map((c) => (
                        <label key={c.id} className="filter-option">
                          <input type="checkbox"
                            checked={filters.categoryIds.includes(c.id)}
                            onChange={() => setFilters({
                              ...filters,
                              categoryIds: toggleArr(filters.categoryIds, c.id),
                            })} />
                          <span className="swatch" style={c.color ? { background: c.color } : undefined} />
                          <span className="lbl">
                            {c.parentName ? `${c.parentName} → ${c.name}` : c.name}
                          </span>
                        </label>
                      ))
                    ) : (
                      // Hierarchical view: parent groups + children
                      grouped.topLevel.map((parent) => {
                        const children = grouped.byParent.get(parent.id) ?? [];
                        return (
                          <div key={parent.id}>
                            <label className="filter-option">
                              <input type="checkbox"
                                checked={filters.categoryIds.includes(parent.id)}
                                onChange={() => setFilters({
                                  ...filters,
                                  categoryIds: toggleArr(filters.categoryIds, parent.id),
                                })} />
                              <span className="swatch" style={parent.color ? { background: parent.color } : undefined} />
                              <span className="lbl"><strong>{parent.name}</strong></span>
                            </label>
                            {children.map((c) => (
                              <label key={c.id} className="filter-option indent">
                                <input type="checkbox"
                                  checked={filters.categoryIds.includes(c.id)}
                                  onChange={() => setFilters({
                                    ...filters,
                                    categoryIds: toggleArr(filters.categoryIds, c.id),
                                  })} />
                                <span className="swatch" style={c.color ? { background: c.color } : undefined} />
                                <span className="lbl">{c.name}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {tab === 'merchants' && (
                <>
                  <div className="filter-search">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="4" /><path d="M9.5 9.5L12 12" />
                    </svg>
                    <input type="search" placeholder="Search merchants…"
                      value={merchSearch} onChange={(e) => setMerchSearch(e.target.value)} />
                  </div>
                  <div className="filter-list">
                    {filteredMerchants.length === 0 && (
                      <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>No merchants match.</div>
                    )}
                    {filteredMerchants.map((m) => (
                      <label key={m} className="filter-option">
                        <input type="checkbox"
                          checked={filters.merchants.includes(m)}
                          onChange={() => setFilters({
                            ...filters,
                            merchants: toggleArr(filters.merchants, m),
                          })} />
                        <VendorLogo merchant={m} size={20} />
                        <span className="lbl">{m}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {tab === 'accounts' && (
                <>
                  <div className="filter-search">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="4" /><path d="M9.5 9.5L12 12" />
                    </svg>
                    <input type="search" placeholder="Search accounts…"
                      value={acctSearch} onChange={(e) => setAcctSearch(e.target.value)} />
                  </div>
                  <div className="filter-list">
                    {filteredAccounts.map((a) => (
                      <label key={a.id} className="filter-option">
                        <input type="checkbox"
                          checked={filters.accountIds.includes(a.id)}
                          onChange={() => setFilters({
                            ...filters,
                            accountIds: toggleArr(filters.accountIds, a.id),
                          })} />
                        <AccountLogo institution={a.institution} size={20} />
                        <span className="lbl">{a.name}</span>
                        <span className="meta">{a.institution}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {tab === 'date' && (
                <div className="filter-section">
                  <div className="preset-row">
                    {DATE_PRESETS.map((p) => (
                      <button type="button" key={p.id}
                        className={'preset-btn' + (filters.dateRange === p.id ? ' active' : '')}
                        onClick={() => setFilters({ ...filters, dateRange: p.id })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {filters.dateRange === 'custom' && (
                    <div className="row-2">
                      <label className="field">
                        From
                        <input type="date" value={filters.customFrom}
                          max={filters.customTo || TODAY}
                          onChange={(e) => setFilters({ ...filters, customFrom: e.target.value })} />
                      </label>
                      <label className="field">
                        To
                        <input type="date" value={filters.customTo}
                          min={filters.customFrom} max={TODAY}
                          onChange={(e) => setFilters({ ...filters, customTo: e.target.value })} />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {tab === 'amount' && (
                <div className="filter-section">
                  <div className="row-2">
                    <label className="field">
                      Min ($)
                      <input type="number" value={filters.amountMin} step="0.01" inputMode="decimal"
                        placeholder="e.g. 10"
                        onChange={(e) => setFilters({ ...filters, amountMin: e.target.value })} />
                    </label>
                    <label className="field">
                      Max ($)
                      <input type="number" value={filters.amountMax} step="0.01" inputMode="decimal"
                        placeholder="e.g. 500"
                        onChange={(e) => setFilters({ ...filters, amountMax: e.target.value })} />
                    </label>
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
                    Compares against the absolute amount (so &ldquo;Min 10&rdquo; matches both +$10 and −$10).
                  </p>
                </div>
              )}

              {tab === 'other' && (
                <div className="filter-list" style={{ paddingTop: 8 }}>
                  <label className="filter-option">
                    <input type="checkbox" checked={filters.hideTransfers}
                      onChange={(e) => setFilters({ ...filters, hideTransfers: e.target.checked })} />
                    <span className="lbl">Hide transfers (between your own accounts)</span>
                  </label>
                  <label className="filter-option">
                    <input type="checkbox" checked={filters.needsReviewOnly}
                      onChange={(e) => setFilters({ ...filters, needsReviewOnly: e.target.checked })} />
                    <span className="lbl">Only transactions that need review</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="filter-footer">
            <button type="button" className="clear-all"
              onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear all filters
            </button>
            <button type="button" className="done-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline quick-edit pickers (row cells) ────────────────────────────────
type Anchor = { x: number; y: number };

function CategoryPicker({
  categories, currentId, anchor, onPick, onClose,
}: {
  categories: CatLite[];
  currentId: string | null;
  anchor: Anchor;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const parents = categories.filter((c) => c.parentId === null);
  const childrenOf = (pid: string) => categories.filter((c) => c.parentId === pid);
  const matches = (c: CatLite) =>
    !query || c.name.toLowerCase().includes(query) || (c.parentName ?? '').toLowerCase().includes(query);

  return (
    <>
      <div className="tx-inline-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="tx-inline-pop" style={{ left: anchor.x, top: anchor.y }} onClick={(e) => e.stopPropagation()}>
        <input
          className="tx-inline-search"
          autoFocus
          placeholder="Search categories…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="tx-inline-list">
          {parents.map((p) => {
            const kids = childrenOf(p.id);
            if (kids.length === 0) {
              if (!matches(p)) return null;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={'tx-inline-item' + (currentId === p.id ? ' on' : '')}
                  onClick={() => onPick(p.id)}
                >
                  <span className="ic">{iconFor(p.name)}</span>
                  <span className="nm">{p.name}</span>
                </button>
              );
            }
            const shownKids = query ? kids.filter(matches) : kids;
            if (shownKids.length === 0 && !matches(p)) return null;
            return (
              <div key={p.id} className="tx-inline-group">
                <div className="tx-inline-head">{p.name}</div>
                {shownKids.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={'tx-inline-item sub' + (currentId === c.id ? ' on' : '')}
                    onClick={() => onPick(c.id)}
                  >
                    <span className="ic">{iconFor(c.name)}</span>
                    <span className="nm">{c.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function AccountPicker({
  accounts, currentId, anchor, onPick, onClose,
}: {
  accounts: AcctLite[];
  currentId: string | null;
  anchor: Anchor;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="tx-inline-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="tx-inline-pop" style={{ left: anchor.x, top: anchor.y }} onClick={(e) => e.stopPropagation()}>
        <div className="tx-inline-list">
          {accounts.length === 0 && <div className="tx-inline-empty">No accounts.</div>}
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              className={'tx-inline-item' + (currentId === a.id ? ' on' : '')}
              onClick={() => onPick(a.id)}
            >
              <AccountLogo institution={a.institution} size={18} />
              <span className="nm">{a.name}</span>
            </button>
          ))}
        </div>
        {currentId && (
          <Link href={`/accounts/${currentId}`} className="tx-inline-foot" onClick={(e) => e.stopPropagation()}>
            View account →
          </Link>
        )}
      </div>
    </>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────
function SortCaret({ dir }: { dir: 'asc' | 'desc' | null }) {
  if (!dir) return null;
  return <span className="tx-th-caret">{dir === 'asc' ? '▲' : '▼'}</span>;
}

function TxnTable({
  rows, scoped, sortBy, onHeaderSort, selectMode, selected, onRowClick, selectedId, categories, onSaved, inline,
}: {
  rows: TxnRow[];
  scoped: boolean;
  sortBy: SortId;
  onHeaderSort: (col: 'date' | 'merchant' | 'amount') => void;
  selectMode: boolean;
  selected: Set<string>;
  onRowClick: (id: string, isOpen: boolean) => void;
  selectedId: string | null;
  categories: CatLite[];
  onSaved: (id: string, patch: TxnPatch) => void;
  inline: {
    editCell: { id: string; field: 'cat' | 'acct'; x: number; y: number } | null;
    openEdit: (e: React.MouseEvent, id: string, field: 'cat' | 'acct') => void;
    accounts: AcctLite[];
    onPickCategory: (id: string, categoryId: string) => void;
    onPickAccount: (id: string, accountId: string) => void;
    onClose: () => void;
    onDeleted: (id: string) => void;
    onViewMerchant: (merchant: string) => void;
  };
}) {
  const dateDir = sortBy === 'date-asc' ? 'asc' : sortBy === 'date-desc' ? 'desc' : null;
  const amtDir = sortBy === 'amount-low' ? 'asc' : sortBy === 'amount-high' ? 'desc' : null;
  const merchActive = sortBy === 'merchant';
  const cols = scoped ? 4 : 5;

  return (
    <table className="tx-table">
      <thead>
        <tr>
          <th className="th-date sortable" onClick={() => onHeaderSort('date')}>Date <SortCaret dir={dateDir} /></th>
          <th className="th-merchant sortable" onClick={() => onHeaderSort('merchant')}>
            Description {merchActive && <span className="tx-th-caret">▲</span>}
          </th>
          <th className="th-cat">Category</th>
          {!scoped && <th className="th-acct">Account</th>}
          <th className="th-amt sortable" onClick={() => onHeaderSort('amount')}>Amount <SortCaret dir={amtDir} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const isOpen = selectedId === t.id;
          const isSel = selected.has(t.id);
          const isPositive = t.amount > 0;
          return (
            <Fragment key={t.id}>
              <tr
                className={
                  'tx-trow' +
                  (t.isTransfer ? ' transfer' : '') +
                  (t.needsReview ? ' needs-review' : '') +
                  (selectMode && isSel ? ' selected' : '') +
                  (isOpen ? ' open' : '')
                }
                title={t.rawDescription}
                onClick={() => onRowClick(t.id, isOpen)}
              >
                <td className="td-date">{fmtDateShort(t.date)}</td>
                <td className="td-merchant">
                  <div className="tx-merchant">
                    {selectMode && <span className={'tx-check' + (isSel ? ' on' : '')} aria-hidden />}
                    <VendorLogo merchant={t.merchant} size={24} />
                    <span className="tx-merchant-name">
                      {t.merchant}
                      {t.needsReview && <span className="tx-pill review">Review</span>}
                      {t.isTransfer && <span className="tx-pill transfer">Transfer</span>}
                    </span>
                  </div>
                </td>
                <td className="td-cat">
                  <div
                    className={'tx-category editable' + (selectMode ? ' no-edit' : '')}
                    onClick={(e) => { if (!selectMode) inline.openEdit(e, t.id, 'cat'); }}
                    title="Change category"
                  >
                    <span
                      className={'tx-category-icon' + (t.categoryName ? '' : ' uncat')}
                      style={{ background: iconBg(t.categoryColor) }}
                      aria-hidden
                    >
                      {iconFor(t.categoryName ?? 'Uncategorized')}
                    </span>
                    <span className={'tx-category-name' + (t.categoryName ? '' : ' uncat')}>
                      {t.categoryName ?? 'Uncategorized'}
                    </span>
                    {inline.editCell?.id === t.id && inline.editCell.field === 'cat' && (
                      <CategoryPicker
                        categories={categories}
                        currentId={t.categoryId}
                        anchor={{ x: inline.editCell.x, y: inline.editCell.y }}
                        onPick={(cid) => inline.onPickCategory(t.id, cid)}
                        onClose={inline.onClose}
                      />
                    )}
                  </div>
                </td>
                {!scoped && (
                  <td className="td-acct">
                    <div
                      className={'tx-account editable' + (selectMode ? ' no-edit' : '')}
                      onClick={(e) => { if (!selectMode) inline.openEdit(e, t.id, 'acct'); }}
                      title="Change account"
                    >
                      <AccountLogo institution={t.accountInstitution} />
                      <span className="tx-account-name">
                        {t.accountName}
                        {t.accountLast4 ? ` ····${t.accountLast4}` : ''}
                      </span>
                      {inline.editCell?.id === t.id && inline.editCell.field === 'acct' && (
                        <AccountPicker
                          accounts={inline.accounts}
                          currentId={t.accountId}
                          anchor={{ x: inline.editCell.x, y: inline.editCell.y }}
                          onPick={(aid) => inline.onPickAccount(t.id, aid)}
                          onClose={inline.onClose}
                        />
                      )}
                    </div>
                  </td>
                )}
                <td className={'td-amt' + (isPositive && !t.isTransfer ? ' pos' : '')}>
                  {fmtMoney(t.amount, { sign: isPositive })}
                </td>
              </tr>
              {isOpen && (
                <tr className="tx-trow-detail">
                  <td colSpan={cols}>
                    <TxnDetail
                      txn={t}
                      categories={categories}
                      onSaved={(patch) => onSaved(t.id, patch)}
                      onDeleted={() => inline.onDeleted(t.id)}
                      onViewMerchant={inline.onViewMerchant}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// How many rows to add to the DOM each time the scroll sentinel appears. The
// full dataset is already in memory; this only controls incremental rendering.
const RENDER_CHUNK = 150;

export function TransactionsClient({
  txns, accounts, categories, merchants, lockAccountId,
}: {
  txns: TxnRow[]; total: number; accounts: AcctLite[]; categories: CatLite[];
  merchants: string[];
  // When set, the list is locked to one account: the account filter is fixed,
  // the Accounts filter tab is hidden, and the per-row account column is dropped
  // (it would be redundant). Used by the per-account detail page.
  lockAccountId?: string;
}) {
  const scoped = !!lockAccountId;
  const baseFilters = useMemo<Filters>(
    () => (lockAccountId ? { ...DEFAULT_FILTERS, accountIds: [lockAccountId] } : DEFAULT_FILTERS),
    [lockAccountId],
  );
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(baseFilters);

  // Apply incoming filters from the URL once (e.g. drill-down from Cashflow:
  // ?cats=<ids>&from=YYYY-MM-DD&to=YYYY-MM-DD, or ?merchant=<name>).
  useEffect(() => {
    const cats = searchParams.get('cats');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const merchant = searchParams.get('merchant');
    if (!cats && !from && !to && !merchant) return;
    setFilters((f) => ({
      ...f,
      categoryIds: cats ? cats.split(',').filter(Boolean) : f.categoryIds,
      merchants: merchant ? [merchant] : f.merchants,
      dateRange: from || to ? 'custom' : f.dateRange,
      customFrom: from ?? f.customFrom,
      customTo: to ?? f.customTo,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sortBy, setSortBy] = useState<SortId>('date-desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const shownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection ("Edit multiple")
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Inline quick-edit popover (category / account) anchored to the clicked cell
  const [editCell, setEditCell] = useState<{ id: string; field: 'cat' | 'acct'; x: number; y: number } | null>(null);
  const openEdit = (e: React.MouseEvent, id: string, field: 'cat' | 'acct') => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditCell((cur) =>
      cur && cur.id === id && cur.field === field
        ? null
        : { id, field, x: Math.min(r.left, window.innerWidth - 264), y: r.bottom + 4 },
    );
  };

  // Saved views (filter/sort presets)
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  // List vs. table view + row density (persisted)
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      if (raw) setViews(JSON.parse(raw) as SavedView[]);
      const vm = localStorage.getItem('transactions:view');
      if (vm === 'table' || vm === 'list') setViewMode(vm);
      const d = localStorage.getItem('transactions:density');
      if (d === 'compact' || d === 'comfortable') setDensity(d);
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  const changeView = (v: 'list' | 'table') => {
    setViewMode(v);
    try { localStorage.setItem('transactions:view', v); } catch { /* ignore */ }
  };
  const changeDensity = (d: 'comfortable' | 'compact') => {
    setDensity(d);
    try { localStorage.setItem('transactions:density', d); } catch { /* ignore */ }
  };
  const clickHeaderSort = (col: 'date' | 'merchant' | 'amount') => {
    if (col === 'date') setSortBy((s) => (s === 'date-desc' ? 'date-asc' : 'date-desc'));
    else if (col === 'amount') setSortBy((s) => (s === 'amount-high' ? 'amount-low' : 'amount-high'));
    else setSortBy('merchant');
  };

  // Filtering, search and sort run server-side, but the whole matching set is
  // returned in one request and held in `rows` — no network paging. `renderLimit`
  // controls how many of those rows are actually in the DOM; scrolling grows it
  // (instant, no fetch). A request-id guard discards superseded responses.
  const [rows, setRows] = useState<TxnRow[]>(txns);
  const [renderLimit, setRenderLimit] = useState(RENDER_CHUNK);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);
  const didMountRef = useRef(false);

  const runFetch = useCallback(async () => {
    const id = ++reqIdRef.current;
    try {
      const res = await fetch(`/api/transactions?${buildTxnQuery(filters, sortBy)}`);
      const j = await res.json();
      if (id !== reqIdRef.current) return; // superseded
      const data = j?.data;
      if (!data || !Array.isArray(data.rows)) return;
      setRows(data.rows);
      setRenderLimit(RENDER_CHUNK);
    } catch {
      /* network error — keep current rows */
    }
  }, [filters, sortBy]);

  // Refetch the full matching set whenever filters or sort change (debounced so
  // typing in search doesn't fire a request per keystroke). The first run is the
  // initial mount, where the server already provided every row — skip it.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const t = setTimeout(() => { void runFetch(); }, 250);
    return () => clearTimeout(t);
  }, [runFetch]);

  // Scrolling near the bottom reveals more already-loaded rows (no network).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || renderLimit >= rows.length) return;
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setRenderLimit((n) => Math.min(n + RENDER_CHUNK, rows.length));
    }, { rootMargin: '1000px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [renderLimit, rows.length]);

  useEffect(() => {
    if (selectedId) {
      if (shownTimerRef.current) clearTimeout(shownTimerRef.current);
      setShownId(selectedId);
    } else if (shownId) {
      shownTimerRef.current = setTimeout(() => setShownId(null), 480);
    }
    return () => { if (shownTimerRef.current) clearTimeout(shownTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedId) setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Full distinct merchant list (server-provided) for the filter picker.
  const allMerchants = merchants;

  // Only the first `renderLimit` rows are put in the DOM (the rest are loaded in
  // memory and revealed as you scroll). The server already filtered + sorted, so
  // here we only group by date for the two date sorts.
  const visibleRows = useMemo(() => rows.slice(0, renderLimit), [rows, renderLimit]);
  const grouped = useMemo(() => {
    if (sortBy !== 'date-desc' && sortBy !== 'date-asc') {
      return [{ date: '__flat__', rows: visibleRows, total: visibleRows.reduce((s, r) => s + r.amount, 0) }];
    }
    const groups: { date: string; rows: TxnRow[]; total: number }[] = [];
    let current: { date: string; rows: TxnRow[]; total: number } | null = null;
    for (const r of visibleRows) {
      if (!current || current.date !== r.date) {
        current = { date: r.date, rows: [], total: 0 };
        groups.push(current);
      }
      current.rows.push(r);
      current.total += r.amount;
    }
    return groups;
  }, [visibleRows, sortBy]);

  // After an inline edit, patch the row in place (resolving the new category's
  // name/color from the catalog) rather than refetching — keeps scroll position.
  const patchLocalRow = useCallback(
    (id: string, patch: TxnPatch) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const cat = patch.categoryId ? categories.find((c) => c.id === patch.categoryId) ?? null : null;
          return {
            ...r,
            merchant: patch.merchant || r.merchant,
            notes: patch.notes,
            isTransfer: patch.isTransfer,
            needsReview: patch.needsReview,
            categoryId: patch.categoryId || null,
            categoryName: cat ? cat.name : null,
            categoryColor: cat ? cat.color : null,
          };
        }),
      );
    },
    [categories],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedId(null);
  }, []);
  const viewMerchant = useCallback(
    (m: string) => {
      setFilters({ ...baseFilters, merchants: [m] });
      setSelectedId(null);
    },
    [baseFilters],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const enterSelect = () => { setSelectMode(true); setSelectedId(null); setEditCell(null); };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const bulkApply = useCallback(
    async (patch: { categoryId?: string | null; isTransfer?: boolean; needsReview?: boolean }) => {
      const ids = [...selected];
      if (ids.length === 0 || bulkBusy) return;
      setBulkBusy(true);
      try {
        await fetch('/api/transactions/bulk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids, ...patch }),
        });
      } catch {
        /* ignore — list refetch below reflects the true state */
      }
      setBulkBusy(false);
      setSelected(new Set());
      void runFetch();
    },
    [selected, bulkBusy, runFetch],
  );

  // Inline single-row edits (optimistic, then persist).
  const applyCategory = useCallback(
    async (id: string, categoryId: string) => {
      setEditCell(null);
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const cat = categories.find((c) => c.id === categoryId) ?? null;
          return { ...r, categoryId, categoryName: cat?.name ?? null, categoryColor: cat?.color ?? null, needsReview: false };
        }),
      );
      await categorizeTxn(id, { categoryId });
    },
    [categories],
  );
  const applyAccount = useCallback(
    async (id: string, accountId: string) => {
      setEditCell(null);
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const a = accounts.find((x) => x.id === accountId);
          return {
            ...r,
            accountId,
            accountName: a?.name ?? r.accountName,
            accountInstitution: a?.institution ?? r.accountInstitution,
            accountLast4: '',
          };
        }),
      );
      await patchTxn(id, { accountId });
    },
    [accounts],
  );

  const persistViews = useCallback((next: SavedView[]) => {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, []);
  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) return;
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    // Replace any existing view with the same name.
    persistViews([...views.filter((v) => v.name !== name), { id, name, filters, sortBy }]);
    setViewName('');
  };
  const applyView = (v: SavedView) => {
    setFilters({ ...DEFAULT_FILTERS, ...v.filters });
    setSortBy(v.sortBy);
    setViewsOpen(false);
  };
  const deleteView = (id: string) => persistViews(views.filter((v) => v.id !== id));

  // The locked account doesn't count as a user-applied filter.
  const filterCount =
    activeFilterCount(filters) - (scoped && filters.accountIds.length > 0 ? 1 : 0);
  const hasAnyFilter = filterCount > 0 || filters.search !== '';
  const clearFilters = () => setFilters(baseFilters);

  return (
    <>
      <div className="tx-toolbar">
        <input
          type="search"
          placeholder="Search"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <button
          type="button"
          className={'tx-toolbar-btn' + (filterCount > 0 ? ' has-filters' : '')}
          onClick={() => setShowFilters(true)}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h10M3.5 7h7M5 11h4" />
          </svg>
          Filters
          {filterCount > 0 && <span className="badge">{filterCount}</span>}
        </button>
        <button
          type="button"
          className={'tx-toolbar-btn' + (selectMode ? ' has-filters' : '')}
          onClick={() => (selectMode ? exitSelect() : enterSelect())}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5h6M2 9.5h6M10.5 3l1.5 1.5L10.5 6M10.5 8l1.5 1.5L10.5 11" />
          </svg>
          {selectMode ? 'Done' : 'Select'}
        </button>
        {!scoped && (
          <div className="tx-views">
            <button
              type="button"
              className={'tx-toolbar-btn' + (viewsOpen ? ' has-filters' : '')}
              onClick={() => setViewsOpen((o) => !o)}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3.5h10M2 7h10M2 10.5h6" />
              </svg>
              Views
              {views.length > 0 && <span className="badge">{views.length}</span>}
            </button>
            {viewsOpen && (
              <>
                <div className="tx-views-backdrop" onClick={() => setViewsOpen(false)} />
                <div className="tx-views-pop">
                  {views.length === 0 ? (
                    <div className="tx-views-empty">No saved views yet.</div>
                  ) : (
                    <div className="tx-views-list">
                      {views.map((v) => (
                        <div className="tx-view-row" key={v.id}>
                          <button type="button" className="name" onClick={() => applyView(v)}>{v.name}</button>
                          <button type="button" className="del" aria-label={`Delete ${v.name}`} onClick={() => deleteView(v.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="tx-views-save">
                    <input
                      type="text"
                      placeholder="Save current filters as…"
                      value={viewName}
                      onChange={(e) => setViewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentView(); }}
                      maxLength={40}
                    />
                    <button type="button" disabled={!viewName.trim()} onClick={saveCurrentView}>Save</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="spacer" />
        <div className="tx-seg" role="group" aria-label="View mode">
          <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => changeView('list')} aria-label="List view" title="List view">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 3.5h10M2 7h10M2 10.5h10" />
            </svg>
          </button>
          <button type="button" className={viewMode === 'table' ? 'active' : ''} onClick={() => changeView('table')} aria-label="Table view" title="Table view">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2.5" width="10" height="9" rx="1" /><path d="M2 5.5h10M6 5.5v6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="tx-toolbar-btn icon"
          onClick={() => changeDensity(density === 'compact' ? 'comfortable' : 'compact')}
          title={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
          aria-label="Toggle density"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {density === 'compact'
              ? <path d="M2 3.5h10M2 7h10M2 10.5h10" />
              : <path d="M2 4h10M2 10h10" />}
          </svg>
        </button>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortId)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        <span className="count">
          {`${rows.length.toLocaleString()} ${rows.length === 1 ? 'transaction' : 'transactions'}`}
        </span>
        {hasAnyFilter && (
          <button type="button" className="clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className={'tx-list' + (scoped ? ' scope-account' : '') + (density === 'compact' ? ' compact' : '')}>
        {rows.length === 0 ? (
          <div className="tx-empty">
            No transactions match your filters.
            {hasAnyFilter && (
              <>
                {' '}
                <button type="button" className="clear-btn" onClick={clearFilters} style={{ textDecoration: 'underline' }}>
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <TxnTable
            rows={visibleRows}
            scoped={scoped}
            sortBy={sortBy}
            onHeaderSort={clickHeaderSort}
            selectMode={selectMode}
            selected={selected}
            onRowClick={(id, isOpen) => (selectMode ? toggleSelect(id) : setSelectedId(isOpen ? null : id))}
            selectedId={selectedId}
            categories={categories}
            onSaved={patchLocalRow}
            inline={{
              editCell,
              openEdit,
              accounts,
              onPickCategory: applyCategory,
              onPickAccount: applyAccount,
              onClose: () => setEditCell(null),
              onDeleted: removeRow,
              onViewMerchant: viewMerchant,
            }}
          />
        ) : (
          grouped.map((group) => (
            <div key={group.date}>
              {group.date !== '__flat__' && (
                <div className="tx-date-hd">
                  <span className="date">{fmtDateLong(group.date)}</span>
                  <span className={'total ' + (group.total > 0 ? 'pos' : 'neg')}>
                    {fmtMoney(group.total, { sign: true })}
                  </span>
                </div>
              )}
              {group.rows.map((t) => {
                const isPositive = t.amount > 0;
                const isOpen = selectedId === t.id;
                const showContent = isOpen || shownId === t.id;
                const isSel = selected.has(t.id);
                return (
                  <div key={t.id} className={'tx-row-wrap' + (isOpen ? ' open' : '')}>
                    <div
                      className={
                        'tx-row' +
                        (t.isTransfer ? ' transfer' : '') +
                        (t.needsReview ? ' needs-review' : '') +
                        (selectMode && isSel ? ' selected' : '')
                      }
                      title={t.rawDescription}
                      onClick={() => (selectMode ? toggleSelect(t.id) : setSelectedId(isOpen ? null : t.id))}
                    >
                      <div className="tx-merchant">
                        {selectMode && <span className={'tx-check' + (isSel ? ' on' : '')} aria-hidden />}
                        <VendorLogo merchant={t.merchant} size={28} />
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <span className="tx-merchant-name">
                            {t.merchant}
                            {t.needsReview && <span className="tx-pill review">Review</span>}
                            {t.isTransfer && <span className="tx-pill transfer">Transfer</span>}
                          </span>
                          {t.notes && <span className="tx-merchant-meta">{t.notes}</span>}
                        </span>
                      </div>

                      <div
                        className={'tx-category editable' + (selectMode ? ' no-edit' : '')}
                        onClick={(e) => { if (!selectMode) openEdit(e, t.id, 'cat'); }}
                        title="Change category"
                      >
                        <span
                          className={'tx-category-icon' + (t.categoryName ? '' : ' uncat')}
                          style={{ background: iconBg(t.categoryColor) }}
                          aria-hidden
                        >
                          {iconFor(t.categoryName ?? 'Uncategorized')}
                        </span>
                        <span className={'tx-category-name' + (t.categoryName ? '' : ' uncat')}>
                          {t.categoryName ?? 'Uncategorized'}
                        </span>
                        {editCell?.id === t.id && editCell.field === 'cat' && (
                          <CategoryPicker
                            categories={categories}
                            currentId={t.categoryId}
                            anchor={{ x: editCell.x, y: editCell.y }}
                            onPick={(cid) => applyCategory(t.id, cid)}
                            onClose={() => setEditCell(null)}
                          />
                        )}
                      </div>

                      {!scoped && (
                        <div
                          className={'tx-account editable' + (selectMode ? ' no-edit' : '')}
                          onClick={(e) => { if (!selectMode) openEdit(e, t.id, 'acct'); }}
                          title="Change account"
                        >
                          <AccountLogo institution={t.accountInstitution} />
                          <span className="tx-account-name">
                            {t.accountName}
                            {t.accountLast4 ? ` ····${t.accountLast4}` : ''}
                          </span>
                          {editCell?.id === t.id && editCell.field === 'acct' && (
                            <AccountPicker
                              accounts={accounts}
                              currentId={t.accountId}
                              anchor={{ x: editCell.x, y: editCell.y }}
                              onPick={(aid) => applyAccount(t.id, aid)}
                              onClose={() => setEditCell(null)}
                            />
                          )}
                        </div>
                      )}

                      <div className={'tx-amount' + (isPositive && !t.isTransfer ? ' pos' : '')}>
                        {fmtMoney(t.amount, { sign: isPositive })}
                      </div>

                      <div className="tx-chev">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 3l4 4-4 4" />
                        </svg>
                      </div>
                    </div>

                    <div className="tx-expand" aria-hidden={!isOpen}>
                      <div className="tx-expand-inner">
                        {showContent && (
                          <TxnDetail
                            txn={t}
                            categories={categories}
                            onSaved={(patch) => {
                              setSelectedId(null);
                              patchLocalRow(t.id, patch);
                            }}
                            onDeleted={() => removeRow(t.id)}
                            onViewMerchant={viewMerchant}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {renderLimit < rows.length && (
        <div
          ref={sentinelRef}
          className="tx-sentinel"
          aria-hidden="true"
          style={{ textAlign: 'center', padding: '18px 0 8px', fontSize: 13, color: 'var(--text-3)', minHeight: 1 }}
        />
      )}

      {selectMode && (
        <div className="tx-bulkbar">
          <div className="tx-bulkbar-left">
            <span className="tx-bulkbar-count"><strong>{selected.size}</strong> selected</span>
            <button type="button" className="tx-bulk-link" onClick={() => setSelected(new Set(rows.map((r) => r.id)))}>
              Select all loaded
            </button>
            {selected.size > 0 && (
              <button type="button" className="tx-bulk-link" onClick={() => setSelected(new Set())}>Clear</button>
            )}
          </div>
          <div className="tx-bulkbar-actions">
            <select
              className="tx-bulk-cat"
              value=""
              disabled={selected.size === 0 || bulkBusy}
              onChange={(e) => { if (e.target.value) void bulkApply({ categoryId: e.target.value, needsReview: false }); }}
            >
              <option value="">Categorize…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.parentName ? `${c.parentName} → ${c.name}` : c.name}</option>
              ))}
            </select>
            <button type="button" disabled={selected.size === 0 || bulkBusy} onClick={() => void bulkApply({ needsReview: false })}>Mark reviewed</button>
            <button type="button" disabled={selected.size === 0 || bulkBusy} onClick={() => void bulkApply({ needsReview: true })}>Add to review</button>
            <button type="button" disabled={selected.size === 0 || bulkBusy} onClick={() => void bulkApply({ isTransfer: true })}>Mark transfer</button>
            <button type="button" disabled={selected.size === 0 || bulkBusy} onClick={() => void bulkApply({ isTransfer: false })}>Not transfer</button>
          </div>
          <button type="button" className="tx-bulk-done" onClick={exitSelect}>Done</button>
        </div>
      )}

      {showFilters && (
        <FilterPanel
          onClose={() => setShowFilters(false)}
          filters={filters}
          setFilters={setFilters}
          categories={categories}
          accounts={accounts}
          allMerchants={allMerchants}
          hideAccounts={scoped}
        />
      )}
    </>
  );
}
