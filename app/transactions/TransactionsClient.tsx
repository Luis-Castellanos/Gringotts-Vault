'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
function buildTxnQuery(f: Filters, sort: SortId, offset: number, limit: number): string {
  const p = new URLSearchParams();
  p.set('offset', String(offset));
  p.set('limit', String(limit));
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

// ─── Inline expansion: edit a single transaction ─────────────────────────
function TxnDetail({
  txn, categories, onSaved,
}: { txn: TxnRow; categories: CatLite[]; onSaved: (patch: TxnPatch) => void }) {
  const [merchant, setMerchant] = useState(txn.merchant);
  const [categoryId, setCategoryId] = useState<string>(txn.categoryId ?? '');
  const [notes, setNotes] = useState(txn.notes ?? '');
  const [isTransfer, setIsTransfer] = useState(txn.isTransfer);
  const [needsReview, setNeedsReview] = useState(txn.needsReview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="tx-expand-content" onClick={(e) => e.stopPropagation()}>
      <div className="tx-form-grid">
        <label>
          Merchant
          <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={200} />
        </label>
        <label>
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Uncategorized —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.parentName ? `${c.parentName} → ${c.name}` : c.name}</option>
            ))}
          </select>
        </label>
        <label className="check-row" style={{ alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={isTransfer} onChange={(e) => setIsTransfer(e.target.checked)} />
          Mark as transfer (excluded from spending / income)
        </label>
        <label className="span-2">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember about this transaction…" maxLength={1000} />
        </label>
        <label className="check-row" style={{ alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          {needsReview ? 'In review queue' : 'Send back to review queue'}
        </label>
      </div>
      <div className="tx-raw"><span className="lbl">Raw</span>{txn.rawDescription}</div>
      <div className="tx-actions">
        {error && <span className="err">{error}</span>}
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
  open, onClose, filters, setFilters,
  categories, accounts, allMerchants, hideAccounts = false,
}: {
  open: boolean;
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

  if (!open) return null;

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

// ─── Main client ──────────────────────────────────────────────────────────
export function TransactionsClient({
  txns, total: initialTotal, accounts, categories, merchants, pageSize, lockAccountId,
}: {
  txns: TxnRow[]; total: number; accounts: AcctLite[]; categories: CatLite[];
  merchants: string[]; pageSize: number;
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
  // ?cats=<ids>&from=YYYY-MM-DD&to=YYYY-MM-DD).
  useEffect(() => {
    const cats = searchParams.get('cats');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!cats && !from && !to) return;
    setFilters((f) => ({
      ...f,
      categoryIds: cats ? cats.split(',').filter(Boolean) : f.categoryIds,
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

  // Filtering, search and sort all run server-side. `rows` holds the current
  // result page(s); `total` is the count matching the active filters. Changing
  // a filter/sort refetches page 0 (debounced); scrolling appends pages. A
  // request-id guard discards responses that a newer fetch has superseded.
  const [rows, setRows] = useState<TxnRow[]>(txns);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);
  const didMountRef = useRef(false);

  const runFetch = useCallback(
    async (offset: number) => {
      const id = ++reqIdRef.current;
      try {
        const res = await fetch(`/api/transactions?${buildTxnQuery(filters, sortBy, offset, pageSize)}`);
        const j = await res.json();
        if (id !== reqIdRef.current) return; // superseded
        const data = j?.data;
        if (!data || !Array.isArray(data.rows)) return;
        setRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]));
        if (typeof data.total === 'number') setTotal(data.total);
      } catch {
        /* network error — keep current rows */
      }
    },
    [filters, sortBy, pageSize],
  );

  // Refetch page 0 whenever filters or sort change (debounced so typing in the
  // search box doesn't fire a request per keystroke). The first run is the
  // initial mount, where the server already provided page 0 — skip it.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const t = setTimeout(() => { void runFetch(0); }, 250);
    return () => clearTimeout(t);
  }, [runFetch]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || rows.length >= total) return;
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingMore) return;
      setLoadingMore(true);
      void runFetch(rows.length).finally(() => setLoadingMore(false));
    }, { rootMargin: '800px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [rows.length, total, loadingMore, runFetch]);

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

  // The server already returns rows filtered + sorted, so here we only group by
  // date for the two date sorts (other sorts render as one flat list).
  const grouped = useMemo(() => {
    if (sortBy !== 'date-desc' && sortBy !== 'date-asc') {
      return [{ date: '__flat__', rows, total: rows.reduce((s, r) => s + r.amount, 0) }];
    }
    const groups: { date: string; rows: TxnRow[]; total: number }[] = [];
    let current: { date: string; rows: TxnRow[]; total: number } | null = null;
    for (const r of rows) {
      if (!current || current.date !== r.date) {
        current = { date: r.date, rows: [], total: 0 };
        groups.push(current);
      }
      current.rows.push(r);
      current.total += r.amount;
    }
    return groups;
  }, [rows, sortBy]);

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

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const enterSelect = () => { setSelectMode(true); setSelectedId(null); };
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
      void runFetch(0);
    },
    [selected, bulkBusy, runFetch],
  );

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
          placeholder="Search merchants or raw description…"
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
        <div className="spacer" />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortId)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        <span className="count">
          {rows.length < total
            ? `${rows.length.toLocaleString()} of ${total.toLocaleString()}`
            : `${total.toLocaleString()} ${total === 1 ? 'transaction' : 'transactions'}`}
        </span>
        {hasAnyFilter && (
          <button type="button" className="clear-btn" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className={'tx-list' + (scoped ? ' scope-account' : '')}>
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

                      <div className="tx-category">
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
                      </div>

                      {!scoped &&
                        (t.accountId ? (
                          <Link
                            href={`/accounts/${t.accountId}`}
                            className="tx-account is-link"
                            onClick={(e) => e.stopPropagation()}
                            title={`View ${t.accountName}`}
                          >
                            <AccountLogo institution={t.accountInstitution} />
                            <span className="tx-account-name">
                              {t.accountName}
                              {t.accountLast4 ? ` ····${t.accountLast4}` : ''}
                            </span>
                          </Link>
                        ) : (
                          <div className="tx-account">
                            <AccountLogo institution={t.accountInstitution} />
                            <span className="tx-account-name">{t.accountName}</span>
                          </div>
                        ))}

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

      {rows.length < total && (
        <div
          ref={sentinelRef}
          className="tx-sentinel"
          aria-hidden="true"
          style={{ textAlign: 'center', padding: '18px 0 8px', fontSize: 13, color: 'var(--text-3)', minHeight: 1 }}
        >
          {loadingMore ? 'Loading more…' : ''}
        </div>
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

      <FilterPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        setFilters={setFilters}
        categories={categories}
        accounts={accounts}
        allMerchants={allMerchants}
        hideAccounts={scoped}
      />
    </>
  );
}
