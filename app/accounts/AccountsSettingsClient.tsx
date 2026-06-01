'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ACCOUNT_TYPES, ACCOUNT_TYPE_GROUPS, accountTypeLabel, assetClassForType } from '@/lib/account-types';
import { faviconUrl, INST_DOMAINS, instDomain, instInitials } from '@/lib/institution-logo';

// Account type is now an open taxonomy slug (see lib/account-types.ts), not a
// fixed union, so the list can be edited in Settings.
export type AcctType = string;

export type AcctRow = {
  id: string;
  name: string;
  institution: string;
  institutionDomain: string;
  last4: string;
  type: AcctType;
  icon: string;
  assetClass: 'asset' | 'liability';
  isActive: boolean;
  openedDate: string | null;
  creditLimit: number | null;
  apr: number | null;
  apy: number | null;
  interestRate: number | null;
  monthlyPayment: number | null;
  originalPrincipal: number | null;
  maturityDate: string | null;
  accountSubtype: string | null;
  count: number;
  balance: number;
};
export type NetWorthPoint = { date: string; value: number };

type Group = 'Cash' | 'Investments' | 'Liabilities' | 'Other';
const GROUPS: Group[] = ['Cash', 'Investments', 'Liabilities', 'Other'];
// Top-level bucket for an account type, derived from the taxonomy.
function kindFor(slug: string): Group {
  if (assetClassForType(slug) === 'liability') return 'Liabilities';
  const g = ACCOUNT_TYPES.find((t) => t.slug === slug)?.group;
  if (g === 'banking') return 'Cash';
  if (g === 'investments' || g === 'retirement') return 'Investments';
  return 'Other';
}
// Order types appear within the Assets / Liabilities sub-groups (taxonomy order).
const TYPE_ORDER: string[] = ACCOUNT_TYPES.map((t) => t.slug);

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return usd.format(n);
}

// ── Institution logo (favicon by domain + initials fallback) ─────────────────
const COMMON_INSTITUTIONS = Object.entries(INST_DOMAINS).map(([name, domain]) => ({ name, domain }));
const CUSTOM_INSTITUTION = '__custom__';

function normalizeDomainInput(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  try {
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? '';
  }
}

function InstLogo({ institution, domainHint }: { institution: string; domainHint?: string }) {
  const domain = domainHint || instDomain(institution);
  const initial = instInitials(institution);
  const [failed, setFailed] = useState(false);
  return (
    <span className="acctset-logo">
      {!failed && domain ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={faviconUrl(domain)} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="acctset-logo-fb">{initial || '?'}</span>
      )}
    </span>
  );
}

async function patchAccount(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message ?? 'Could not save.' };
  return { ok: true };
}

type Modal = { mode: 'add' } | { mode: 'merge'; acct: AcctRow } | null;

export function AccountsSettingsClient({
  accounts,
  netWorthSeries,
  compactCards = false,
  initialView = 'list',
  showNetWorthOverview = false,
}: {
  accounts: AcctRow[];
  netWorthSeries?: NetWorthPoint[];
  compactCards?: boolean;
  initialView?: 'grid' | 'list';
  showNetWorthOverview?: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>(initialView);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [accountOrders, setAccountOrders] = useState<Record<string, string[]>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingBucket, setDraggingBucket] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem('accounts:settings:order'); if (raw) setAccountOrders(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('accounts:settings:order', JSON.stringify(accountOrders)); } catch { /* ignore */ }
  }, [accountOrders]);

  const toggleGroup = (g: string) =>
    setCollapsed((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(['Assets', 'Liabilities']));

  const visible = showClosed ? accounts : accounts.filter((a) => a.isActive);
  const closedCount = accounts.filter((a) => !a.isActive).length;

  function renderAccount(a: AcctRow) {
    const open = expandedId === a.id;
    return (
      <li key={a.id} className={`acctset-item${open ? ' open' : ''}${a.isActive ? '' : ' closed'}`}>
        <div
          className="acctset-row"
          role="button"
          tabIndex={0}
          onClick={() => setExpandedId(open ? null : a.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(open ? null : a.id); } }}
        >
          <Caret open={open} small />
          <InstLogo institution={a.institution} domainHint={a.institutionDomain} />
          <span className="acctset-name">
            {a.name}
            {a.last4 && <span className="acctset-last4">····{a.last4}</span>}
            {!a.isActive && <span className="acctset-badge">Closed</span>}
          </span>
          <span className="acctset-bal numeric">{usd.format(a.balance)}</span>
          <span className="acctset-txns numeric">{a.count.toLocaleString()} txns</span>
        </div>
        {open && (
          <AccountDetail
            key={a.id}
            acct={a}
            onSaved={() => router.refresh()}
            onMerge={() => setModal({ mode: 'merge', acct: a })}
            onDelete={() => onDelete(a)}
          />
        )}
      </li>
    );
  }

  function renderCard(a: AcctRow, bucketKey: string, bucketRows: AcctRow[]) {
    const dragCls =
      draggingId === a.id ? ' dragging'
      : dropTarget?.id === a.id ? (dropTarget.edge === 'before' ? ' drop-before' : ' drop-after')
      : '';
    return (
      <div
        key={a.id}
        className={`acctset-card${a.isActive ? '' : ' closed'}${dragCls}`}
        role="button"
        tabIndex={0}
        draggable
        onClick={() => setExpandedId(a.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(a.id); } }}
        onDragStart={(e) => onCardDragStart(e, a.id, bucketKey)}
        onDragOver={(e) => onCardDragOver(e, a.id, bucketKey)}
        onDrop={(e) => onCardDrop(e, a.id, bucketKey, bucketRows)}
        onDragEnd={onCardDragEnd}
      >
        <button
          type="button"
          className="acctset-card-remove"
          title="Remove account"
          aria-label="Remove account"
          onClick={(e) => { e.stopPropagation(); onDelete(a); }}
        >×</button>
        <div className="acctset-card-top">
          <InstLogo institution={a.institution} domainHint={a.institutionDomain} />
          <div className="acctset-card-id">
            <span className="acctset-card-name">
              {a.name}{!a.isActive && <span className="acctset-badge">Closed</span>}
            </span>
            <span className="acctset-card-sub">{a.institution || '—'}{a.last4 ? ` ····${a.last4}` : ''}</span>
          </div>
        </div>
        <div className="acctset-card-bal numeric">{usd.format(a.balance)}</div>
        <div className="acctset-card-foot">{accountTypeLabel(a.type)} · {a.count.toLocaleString()} txns</div>
      </div>
    );
  }

  async function call(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error?.message ?? 'Something went wrong.'); return false; }
      setModal(null);
      router.refresh();
      return true;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onDelete(a: AcctRow) {
    if (a.count > 0) { setModal({ mode: 'merge', acct: a }); return; }
    if (confirm(`Delete "${a.name}"? It has no transactions. This can't be undone.`)) {
      call('DELETE', `/api/accounts/${a.id}`);
    }
  }

  // ── Drag-to-reorder within a type sub-group (grid view) ─────────────────
  function orderRows(bucketKey: string, rows: AcctRow[]): AcctRow[] {
    const order = accountOrders[bucketKey];
    if (!order || order.length === 0) return rows;
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...rows].sort((a, b) => {
      const ai = idx.get(a.id); const bi = idx.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }
  function onCardDragStart(e: React.DragEvent, id: string, bucketKey: string) {
    setDraggingId(id); setDraggingBucket(bucketKey);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  }
  function onCardDragOver(e: React.DragEvent, id: string, bucketKey: string) {
    if (!draggingId || id === draggingId || draggingBucket !== bucketKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    setDropTarget((cur) => (cur && cur.id === id && cur.edge === edge ? cur : { id, edge }));
  }
  function onCardDrop(e: React.DragEvent, targetId: string, bucketKey: string, bucketRows: AcctRow[]) {
    e.preventDefault();
    const sourceId = draggingId; const target = dropTarget;
    setDraggingId(null); setDraggingBucket(null); setDropTarget(null);
    if (!sourceId || sourceId === targetId || !target || draggingBucket !== bucketKey) return;
    const next = bucketRows.map((r) => r.id);
    const sourceIdx = next.indexOf(sourceId);
    let targetIdx = next.indexOf(target.id);
    if (sourceIdx === -1 || targetIdx === -1) return;
    next.splice(sourceIdx, 1);
    if (sourceIdx < targetIdx) targetIdx -= 1;
    next.splice(target.edge === 'before' ? targetIdx : targetIdx + 1, 0, sourceId);
    setAccountOrders((prev) => ({ ...prev, [bucketKey]: next }));
  }
  function onCardDragEnd() { setDraggingId(null); setDraggingBucket(null); setDropTarget(null); }

  const modalNode = modal?.mode === 'merge' ? (
    <MergeModal
      acct={modal.acct}
      accounts={accounts}
      busy={busy}
      error={error}
      onClose={() => { setModal(null); setError(null); }}
      onMerge={(targetId) => call('POST', `/api/accounts/${modal.acct.id}/merge`, { targetId })}
      onDeleteUnassigned={() => call('DELETE', `/api/accounts/${modal.acct.id}?unassign=1`)}
    />
  ) : modal?.mode === 'add' ? (
    <AddModal
      busy={busy}
      error={error}
      accounts={accounts}
      onClose={() => { setModal(null); setError(null); }}
      onCreate={(payload) => call('POST', '/api/accounts', payload)}
    />
  ) : null;

  if (showNetWorthOverview) {
    return (
      <div className="acctset acctset-networth-page">
        <header className="acctset-nw-header">
          <h1>Accounts</h1>
          <div className="acctset-nw-actions">
            <button type="button" className="acctset-tool-btn">Filters</button>
            <button type="button" className="acctset-tool-btn" onClick={() => router.refresh()}>Refresh all</button>
            <button className="acctset-add primary" onClick={() => setModal({ mode: 'add' })}>
              <Plus /> Add account
            </button>
          </div>
        </header>

        {error && (
          <div className="acctset-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        <NetWorthOverview accounts={visible} series={netWorthSeries ?? []} />
        <div className="acctset-nw-body">
          <NetWorthCategoryList accounts={visible} series={netWorthSeries ?? []} />
          <NetWorthSummaryPanel accounts={visible} />
        </div>
        {modalNode}
      </div>
    );
  }

  return (
    <div className={`acctset${compactCards ? ' compact-cards' : ''}`}>
      <header className="acctset-head">
        <div className="acctset-viewtoggle" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === 'grid'} className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view" title="Grid">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="4" height="4" rx="0.8" /><rect x="8" y="2" width="4" height="4" rx="0.8" /><rect x="2" y="8" width="4" height="4" rx="0.8" /><rect x="8" y="8" width="4" height="4" rx="0.8" /></svg>
          </button>
          <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view" title="List">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h10M2 7h10M2 10h10" /></svg>
          </button>
        </div>
        <div className="acctset-head-actions">
          <button type="button" className="acctset-tool-btn" onClick={expandAll}>Expand all</button>
          <button type="button" className="acctset-tool-btn" onClick={collapseAll}>Collapse all</button>
          <button className="acctset-add" onClick={() => setModal({ mode: 'add' })}>
            <Plus /> Add account
          </button>
        </div>
      </header>

      {error && (
        <div className="acctset-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {(['Assets', 'Liabilities'] as const).map((top) => {
        const isLiab = top === 'Liabilities';
        const accts = visible.filter((a) => (a.assetClass === 'liability') === isLiab);
        if (accts.length === 0) return null;
        const isCollapsed = collapsed.has(top);
        const total = accts.reduce((s, a) => s + a.balance, 0);
        const byType = new Map<AcctType, AcctRow[]>();
        for (const a of accts) {
          const arr = byType.get(a.type) ?? [];
          arr.push(a);
          byType.set(a.type, arr);
        }
        return (
          <section key={top} className={`acctset-section${isCollapsed ? ' collapsed' : ''}`}>
            <button className="acctset-section-head" onClick={() => toggleGroup(top)} aria-expanded={!isCollapsed}>
              <h2>{top} <span className="acctset-count">{accts.length}</span></h2>
              <Caret open={!isCollapsed} />
              <span className="acctset-section-total numeric">{usd.format(total)}</span>
            </button>
            {!isCollapsed &&
              TYPE_ORDER.filter((t) => byType.has(t)).map((t) => {
                const typeRows = byType.get(t)!.slice().sort((a, b) => a.name.localeCompare(b.name));
                const typeTotal = typeRows.reduce((s, a) => s + a.balance, 0);
                const subKey = `${top}:${t}`;
                const subOpen = !collapsed.has(subKey);
                return (
                  <div key={t} className={'acctset-subgroup' + (subOpen ? '' : ' collapsed')}>
                    <div
                      className="acctset-subgroup-head"
                      role="button"
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleGroup(subKey)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(subKey); } }}
                    >
                      <span className="acctset-subgroup-name">{accountTypeLabel(t)} <Caret open={subOpen} small /></span>
                      <span className="acctset-subgroup-count">{typeRows.length}</span>
                      <span className="acctset-subgroup-total numeric">{usd.format(typeTotal)}</span>
                    </div>
                    {subOpen && (view === 'grid'
                      ? <div className="acctset-grid">{orderRows(t, typeRows).map((a, _i, arr) => renderCard(a, t, arr))}</div>
                      : <ul className="acctset-list">{typeRows.map(renderAccount)}</ul>)}
                  </div>
                );
              })}
          </section>
        );
      })}

      {closedCount > 0 && (
        <button className="acctset-show-closed" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? 'Hide' : 'Show'} {closedCount} closed {closedCount === 1 ? 'account' : 'accounts'}
        </button>
      )}

      {view === 'grid' && expandedId && (() => {
        const a = accounts.find((x) => x.id === expandedId);
        if (!a) return null;
        return (
          <div className="cc-modal-root">
            <div className="cc-modal-backdrop" onClick={() => setExpandedId(null)}>
              <div className="cc-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="cc-detail-modal-header">
                  <InstLogo institution={a.institution} domainHint={a.institutionDomain} />
                  <div className="cc-detail-modal-title">
                    <h2>{a.name}</h2>
                    <p>{a.institution || '—'}{a.last4 ? ` ····${a.last4}` : ''} · {accountTypeLabel(a.type)}</p>
                  </div>
                  <button className="cc-detail-modal-close" onClick={() => setExpandedId(null)} aria-label="Close">×</button>
                </div>
                <div className="cc-detail-modal-body">
                  <AccountDetail
                    key={a.id}
                    acct={a}
                    onSaved={() => router.refresh()}
                    onMerge={() => { setExpandedId(null); setModal({ mode: 'merge', acct: a }); }}
                    onDelete={() => { setExpandedId(null); onDelete(a); }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {modalNode}
    </div>
  );
}

function NetWorthOverview({ accounts, series }: { accounts: AcctRow[]; series: NetWorthPoint[] }) {
  const active = accounts.filter((a) => a.isActive);
  const assets = active
    .filter((a) => a.assetClass === 'asset')
    .reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const liabilities = active
    .filter((a) => a.assetClass === 'liability')
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = assets - liabilities;
  const first = series[0]?.value ?? netWorth;
  const last = series[series.length - 1]?.value ?? netWorth;
  const change = last - first;
  const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : null;

  return (
    <section className="acctset-overview acctset-nw-chart-card" aria-label="Net worth overview">
      <div className="acctset-overview-head">
        <div>
          <div className="acctset-kicker">Net worth</div>
          <div className="acctset-networth numeric">{usd2.format(netWorth)}</div>
          <div className={`acctset-netchange numeric ${change >= 0 ? 'pos' : 'neg'}`}>
            <span>{change >= 0 ? '↗' : '↘'} {usd2.format(Math.abs(change))}</span>
            {changePct != null && <span>({changePct >= 0 ? '+' : '-'}{pct.format(Math.abs(changePct))}%)</span>}
            <span className="muted">1 month change</span>
          </div>
        </div>
        <div className="acctset-nw-chart-controls">
          <select aria-label="Chart metric" defaultValue="net-worth">
            <option value="net-worth">Net worth performance</option>
            <option value="assets">Assets</option>
            <option value="liabilities">Liabilities</option>
          </select>
          <select aria-label="Chart period" defaultValue="1m">
            <option value="1m">1 month</option>
            <option value="3m">3 months</option>
            <option value="1y">1 year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>
      <NetWorthTrendChart series={series} fallback={netWorth} />
    </section>
  );
}

type NetWorthCategory = {
  key: string;
  label: string;
  total: number;
  assetClass: 'asset' | 'liability';
  color: string;
};

const NET_WORTH_CATEGORIES: Omit<NetWorthCategory, 'total'>[] = [
  { key: 'credit_cards', label: 'Credit Cards', assetClass: 'liability', color: '#d75b57' },
  { key: 'cash', label: 'Cash', assetClass: 'asset', color: '#53a56f' },
  { key: 'loans', label: 'Loans', assetClass: 'liability', color: '#f0c85a' },
  { key: 'investments', label: 'Investments', assetClass: 'asset', color: '#85d8f0' },
  { key: 'vehicles', label: 'Vehicles', assetClass: 'asset', color: '#ef7044' },
  { key: 'real_estate', label: 'Real Estate', assetClass: 'asset', color: '#6e84f5' },
];

function netWorthCategoryKey(row: AcctRow): string {
  const def = ACCOUNT_TYPES.find((t) => t.slug === row.type);
  if (row.type === 'credit_card') return 'credit_cards';
  if (def?.assetClass === 'liability') return 'loans';
  if (def?.group === 'banking') return 'cash';
  if (def?.group === 'investments' || def?.group === 'retirement') return 'investments';
  if (row.type === 'vehicle') return 'vehicles';
  if (row.type === 'real_estate') return 'real_estate';
  return 'cash';
}

function getNetWorthCategories(accounts: AcctRow[]): NetWorthCategory[] {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    const key = netWorthCategoryKey(account);
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(account.balance));
  }
  return NET_WORTH_CATEGORIES.map((category) => ({
    ...category,
    total: totals.get(category.key) ?? 0,
  }));
}

function NetWorthCategoryList({ accounts, series }: { accounts: AcctRow[]; series: NetWorthPoint[] }) {
  const categories = getNetWorthCategories(accounts);
  const grossTotal = categories.reduce((sum, category) => sum + category.total, 0);
  const first = series[0]?.value;
  const last = series[series.length - 1]?.value;
  const netChange = first != null && last != null ? last - first : 0;
  return (
    <section className="acctset-nw-category-list" aria-label="Account categories">
      {categories.map((category) => {
        const estimatedChange = grossTotal > 0 ? Math.abs(netChange) * (category.total / grossTotal) : 0;
        const changeClass = category.assetClass === 'asset'
          ? (netChange >= 0 ? 'pos' : 'neg')
          : (netChange >= 0 ? 'neg' : 'pos');
        return (
          <button type="button" key={category.key} className="acctset-nw-category-row">
            <Caret open={false} small />
            <span className="acctset-nw-category-name">{category.label}</span>
            <span className={`acctset-nw-category-change ${changeClass}`}>
              {estimatedChange > 0 ? (changeClass === 'pos' ? '↗ ' : '↘ ') : ''}{usd2.format(estimatedChange)}
            </span>
            <span className="acctset-nw-category-period">1 month change</span>
            <span className="acctset-nw-category-total numeric">{usd2.format(category.total)}</span>
          </button>
        );
      })}
    </section>
  );
}

function NetWorthSummaryPanel({ accounts }: { accounts: AcctRow[] }) {
  const categories = getNetWorthCategories(accounts);
  const assets = categories.filter((category) => category.assetClass === 'asset' && category.total > 0);
  const liabilities = categories.filter((category) => category.assetClass === 'liability' && category.total > 0);
  const assetsTotal = assets.reduce((sum, category) => sum + category.total, 0);
  const liabilitiesTotal = liabilities.reduce((sum, category) => sum + category.total, 0);

  return (
    <aside className="acctset-nw-summary" aria-label="Net worth summary">
      <div className="acctset-nw-summary-head">
        <h2>Summary</h2>
        <div className="acctset-nw-tabs" aria-label="Summary mode">
          <button type="button" className="active">Totals</button>
          <button type="button">Percent</button>
        </div>
      </div>
      <NetWorthSummaryGroup title="Assets" total={assetsTotal} categories={assets} />
      <NetWorthSummaryGroup title="Liabilities" total={liabilitiesTotal} categories={liabilities} />
    </aside>
  );
}

function NetWorthSummaryGroup({
  title,
  total,
  categories,
}: {
  title: string;
  total: number;
  categories: NetWorthCategory[];
}) {
  return (
    <div className="acctset-nw-summary-group">
      <div className="acctset-nw-summary-title">
        <strong>{title}</strong>
        <span className="numeric">{usd2.format(total)}</span>
      </div>
      {categories.length > 0 ? (
        <>
          <div className="acctset-nw-stack" aria-hidden>
            {categories.map((category) => (
              <span
                key={category.key}
                style={{
                  background: category.color,
                  width: `${Math.max((category.total / total) * 100, 2)}%`,
                }}
              />
            ))}
          </div>
          <div className="acctset-nw-legend">
            {categories.map((category) => (
              <div key={category.key} className="acctset-nw-legend-row">
                <span className="acctset-nw-dot" style={{ background: category.color }} />
                <span>{category.label}</span>
                <strong className="numeric">{usd2.format(category.total)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <span className="acctset-empty-bar">No balances yet.</span>
      )}
    </div>
  );
}

type CompositionSegment = {
  key: Group;
  label: string;
  total: number;
  count: number;
  share: number;
  color: string;
};

const COMPOSITION_COLORS: Record<Group, string> = {
  Cash: '#4f86d9',
  Investments: '#55b08b',
  Liabilities: '#d16d62',
  Other: '#a78bfa',
};

function summarizeComposition(rows: AcctRow[]): CompositionSegment[] {
  const grouped = new Map<Group, { total: number; count: number }>();
  for (const row of rows) {
    const key = kindFor(row.type);
    const item = grouped.get(key) ?? { total: 0, count: 0 };
    item.total += Math.abs(row.balance);
    item.count += 1;
    grouped.set(key, item);
  }
  const total = [...grouped.values()].reduce((sum, item) => sum + item.total, 0);
  if (total <= 0) return [];
  const out: CompositionSegment[] = [];
  for (const key of GROUPS) {
    const item = grouped.get(key);
    if (!item || item.total <= 0) continue;
    out.push({
      key,
      label: key,
      total: item.total,
      count: item.count,
      share: (item.total / total) * 100,
      color: COMPOSITION_COLORS[key],
    });
  }
  return out;
}

function CompositionPie({ segments }: { segments: CompositionSegment[] }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="acctset-composition-card">
      <div className="acctset-composition-head">
        <div>
          <div className="acctset-kicker">Composition</div>
          <h2>What makes up net worth</h2>
        </div>
      </div>
      {segments.length === 0 ? (
        <span className="acctset-empty-bar">No active account balances yet.</span>
      ) : (
        <>
          <div className="acctset-pie-wrap">
            <svg className="acctset-pie" viewBox="0 0 120 120" aria-hidden>
              <circle className="acctset-pie-bg" cx="60" cy="60" r={radius} />
              {segments.map((segment) => {
                const dash = (segment.share / 100) * circumference;
                const currentOffset = offset;
                offset += dash;
                return (
                  <circle
                    key={segment.key}
                    className="acctset-pie-slice"
                    cx="60"
                    cy="60"
                    r={radius}
                    stroke={segment.color}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-currentOffset}
                  />
                );
              })}
            </svg>
            <div className="acctset-pie-center">
              <span>Total</span>
              <strong>{segments.length}</strong>
            </div>
          </div>
          <div className="acctset-composition-grid">
            {segments.map((segment) => (
              <div key={segment.key} className="acctset-composition-tile">
                <span className="acctset-composition-dot" style={{ background: segment.color }} />
                <div>
                  <strong>{segment.label}</strong>
                  <span>{segment.count} {segment.count === 1 ? 'account' : 'accounts'}</span>
                </div>
                <div className="numeric">
                  <strong>{fmtShort(segment.total)}</strong>
                  <span>{pct.format(segment.share)}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NetWorthTrendChart({ series, fallback }: { series: NetWorthPoint[]; fallback: number }) {
  const points = series.length >= 2 ? series : [{ date: 'start', value: fallback }, { date: 'now', value: fallback }];
  const W = 900;
  const H = 260;
  const padL = 74;
  const padR = 26;
  const padT = 18;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const values = points.map((p) => p.value);
  const minRaw = Math.min(...values);
  const maxRaw = Math.max(...values);
  const pad = Math.max((maxRaw - minRaw) * 0.12, Math.max(Math.abs(fallback) * 0.06, 100));
  const min = Math.min(0, minRaw - pad);
  const max = Math.max(0, maxRaw + pad);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - min) / span) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const baseline = y(Math.max(0, min));
  const area = `${line} L${x(points.length - 1).toFixed(1)},${baseline.toFixed(1)} L${x(0).toFixed(1)},${baseline.toFixed(1)} Z`;
  const ticks = [max, min + span / 2, min];
  const startDate = points[0]?.date ?? '';
  const midDate = points[Math.floor(points.length / 2)]?.date ?? '';
  const endDate = points[points.length - 1]?.date ?? '';

  return (
    <div className="acctset-net-chart-wrap">
      <svg className="acctset-net-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <linearGradient id="acctset-net-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--nw-line, #4aa6c8)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--nw-line, #4aa6c8)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="acctset-net-grid" x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} />
            <text className="acctset-net-y" x={padL - 12} y={y(tick) + 4} textAnchor="end">{fmtShort(tick)}</text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line className="acctset-net-zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
        )}
        <path d={area} fill="url(#acctset-net-fill)" />
        <path d={line} fill="none" stroke="var(--nw-line, #4aa6c8)" strokeWidth="3.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="acctset-net-x">
        <span>{formatChartDate(startDate)}</span>
        <span>{formatChartDate(midDate)}</span>
        <span>{formatChartDate(endDate)}</span>
      </div>
    </div>
  );
}

function formatChartDate(date: string) {
  if (!date || date === 'start' || date === 'now') return '';
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ── Expanded per-account detail (stats + inline edit + actions) ──────────────

function AccountDetail({
  acct, onSaved, onMerge, onDelete,
}: {
  acct: AcctRow;
  onSaved: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<AcctType>(acct.type);
  const isCard = type === 'credit_card';
  const isCashLike = type === 'checking' || type === 'savings' || type === 'cash';
  const isLoan = type === 'loan';
  const isInvest = type === 'brokerage' || type === 'retirement';

  const [name, setName] = useState(acct.name);
  const [institution, setInstitution] = useState(acct.institution);
  const [last4, setLast4] = useState(acct.last4);
  const [openedAt, setOpenedAt] = useState(acct.openedDate ?? '');
  const [creditLimit, setCreditLimit] = useState(acct.creditLimit != null ? String(acct.creditLimit) : '');
  const [apr, setApr] = useState(acct.apr != null ? String(acct.apr) : '');
  const [apy, setApy] = useState(acct.apy != null ? String(acct.apy) : '');
  const [interestRate, setInterestRate] = useState(acct.interestRate != null ? String(acct.interestRate) : '');
  const [monthlyPayment, setMonthlyPayment] = useState(acct.monthlyPayment != null ? String(acct.monthlyPayment) : '');
  const [originalPrincipal, setOriginalPrincipal] = useState(acct.originalPrincipal != null ? String(acct.originalPrincipal) : '');
  const [maturityDate, setMaturityDate] = useState(acct.maturityDate ?? '');
  const [accountSubtype, setAccountSubtype] = useState(acct.accountSubtype ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const util = isCard && acct.creditLimit ? (-acct.balance / acct.creditLimit) * 100 : null;
  const available = isCard && acct.creditLimit != null ? acct.creditLimit + acct.balance : null;
  const paidOff = isLoan && acct.originalPrincipal ? (1 - Math.abs(acct.balance) / acct.originalPrincipal) * 100 : null;
  const num = (s: string) => (s.trim() === '' ? null : Number(s));

  async function save() {
    setSaving(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      institution: institution.trim() || null,
      accountNumber: last4.trim() || null,
      openedAt: openedAt || null,
    };
    if (isCard) { payload.creditLimit = num(creditLimit); payload.apr = num(apr); }
    if (isCashLike) payload.apy = num(apy);
    if (isLoan) {
      payload.interestRate = num(interestRate);
      payload.monthlyPayment = num(monthlyPayment);
      payload.originalPrincipal = num(originalPrincipal);
      payload.maturityDate = maturityDate || null;
    }
    if (isInvest) payload.accountSubtype = accountSubtype.trim() || null;
    const r = await patchAccount(acct.id, payload);
    setSaving(false);
    if (!r.ok) { setErr(r.error ?? 'Could not save.'); return; }
    onSaved();
  }

  async function toggleStatus() {
    setStatusBusy(true);
    const r = await patchAccount(acct.id, { isActive: !acct.isActive });
    setStatusBusy(false);
    if (!r.ok) { setErr(r.error ?? 'Could not update.'); return; }
    onSaved();
  }

  return (
    <div className="acctset-detail">
      <div className="acctset-stats">
        <Stat label="Balance" value={usd2.format(acct.balance)} />
        <Stat label="Transactions" value={acct.count.toLocaleString()} />
        {isCard && <Stat label="Utilization" value={util != null ? `${util.toFixed(1)}%` : '—'} />}
        {isCard && <Stat label="Available" value={available != null ? usd2.format(available) : '—'} />}
        {isCashLike && acct.apy != null && <Stat label="APY" value={`${acct.apy}%`} />}
        {isLoan && paidOff != null && <Stat label="Paid off" value={`${paidOff.toFixed(1)}%`} />}
        {isLoan && acct.monthlyPayment != null && <Stat label="Monthly" value={usd2.format(acct.monthlyPayment)} />}
        {isInvest && acct.accountSubtype && <Stat label="Subtype" value={acct.accountSubtype} />}
        <Stat label="Status" value={acct.isActive ? 'Active' : 'Closed'} />
      </div>

      <div className="acctset-form">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as AcctType)}>
            {ACCOUNT_TYPE_GROUPS.map((grp) => (
              <optgroup key={grp.key} label={grp.label}>
                {ACCOUNT_TYPES.filter((t) => t.group === grp.key).map((t) => (
                  <option key={t.slug} value={t.slug}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Institution"><input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="—" /></Field>
        <Field label="Last 4"><input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} placeholder="—" /></Field>
        <Field label="Opened"><input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} /></Field>
        {isCard && <Field label="Credit limit"><input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isCard && <Field label="APR %"><input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isCashLike && <Field label="APY %"><input value={apy} onChange={(e) => setApy(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isLoan && <Field label="Interest rate %"><input value={interestRate} onChange={(e) => setInterestRate(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isLoan && <Field label="Monthly payment"><input value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isLoan && <Field label="Original principal"><input value={originalPrincipal} onChange={(e) => setOriginalPrincipal(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isLoan && <Field label="Maturity date"><input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} /></Field>}
        {isInvest && <Field label="Subtype"><input value={accountSubtype} onChange={(e) => setAccountSubtype(e.target.value)} placeholder="Jedi trust / 401(k) / HSA..." /></Field>}
      </div>

      {err && <div className="acctset-detail-err">{err}</div>}

      <div className="acctset-detail-actions">
        <div className="left">
          <button className="acctset-link-btn" onClick={toggleStatus} disabled={statusBusy}>
            {acct.isActive ? 'Mark as closed' : 'Re-open'}
          </button>
          <button className="acctset-link-btn" onClick={onMerge}>Merge into…</button>
          <button className="acctset-link-btn danger" onClick={onDelete}>Delete</button>
        </div>
        <button className="pg-btn primary" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="acctset-stat">
      <span className="acctset-stat-lbl">{label}</span>
      <span className="acctset-stat-val numeric">{value}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="acctset-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ── Add modal ────────────────────────────────────────────────────────────────

function AddModal({
  busy, error, accounts, onClose, onCreate,
}: {
  busy: boolean;
  error: string | null;
  accounts: AcctRow[];
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<'chooser' | 'manual'>('chooser');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AcctType>('');
  const [institutionChoice, setInstitutionChoice] = useState('');
  const [customInstitution, setCustomInstitution] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [last4, setLast4] = useState('');
  const isCard = type === 'credit_card';
  const [creditLimit, setCreditLimit] = useState('');
  const [apr, setApr] = useState('');
  const selectedInstitution = COMMON_INSTITUTIONS.find((i) => i.name === institutionChoice);
  const institution = institutionChoice === CUSTOM_INSTITUTION ? customInstitution.trim() : selectedInstitution?.name ?? '';
  const institutionDomain = institutionChoice === CUSTOM_INSTITUTION ? normalizeDomainInput(customDomain) : selectedInstitution?.domain ?? '';
  const canSubmit = !!name.trim() && !!type && !!institution && (institutionChoice !== CUSTOM_INSTITUTION || !!institutionDomain);
  const searchResults = search.trim()
    ? COMMON_INSTITUTIONS.filter((inst) => inst.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 5)
    : [];
  const addCounts = getAddAccountCounts(accounts);

  function startManual(nextType = '') {
    setType(nextType);
    setMode('manual');
  }

  function pickInstitution(inst: { name: string; domain: string }) {
    setInstitutionChoice(inst.name);
    if (!type) setType('checking');
    if (!name.trim()) setName(inst.name);
    setMode('manual');
  }

  function submit() {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      type,
      institution,
      institutionDomain,
      accountNumber: last4.trim() || null,
      creditLimit: isCard && creditLimit ? Number(creditLimit) : null,
      apr: isCard && apr ? Number(apr) : null,
    });
  }

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className={`cc-modal acctset-add-modal${mode === 'chooser' ? ' chooser' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="acctset-add-modal-head">
            <h2>Add an account</h2>
            <button type="button" className="acctset-add-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          {mode === 'chooser' ? (
            <>
              <label className="acctset-inst-search">
                <span aria-hidden>⌕</span>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search 13,000 institutions..."
                />
              </label>
              {searchResults.length > 0 && (
                <div className="acctset-inst-results">
                  {searchResults.map((inst) => (
                    <button type="button" key={inst.name} onClick={() => pickInstitution(inst)}>
                      <InstLogo institution={inst.name} domainHint={inst.domain} />
                      <span>{inst.name}</span>
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              )}
              <div className="acctset-add-options">
                <AddOption
                  title="Banks & credit cards"
                  subtitle={`${addCounts.banking} added`}
                  logos={[
                    { institution: 'Chase', domain: 'chase.com' },
                    { institution: 'Capital One', domain: 'capitalone.com' },
                    { institution: 'Wells Fargo', domain: 'wellsfargo.com' },
                  ]}
                  onClick={() => startManual('checking')}
                />
                <AddOption
                  title="Investments & loans"
                  subtitle={`${addCounts.investing} added`}
                  logos={[
                    { institution: 'Fidelity', domain: 'fidelity.com' },
                    { institution: 'Charles Schwab', domain: 'schwab.com' },
                    { institution: 'Vanguard', domain: 'vanguard.com' },
                  ]}
                  onClick={() => startManual('brokerage')}
                />
                <AddOption
                  title="Real estate, crypto, and more"
                  subtitle={`${addCounts.more} added`}
                  logos={[
                    { institution: 'Coinbase', domain: 'coinbase.com' },
                    { institution: 'Zillow', domain: 'zillow.com' },
                  ]}
                  onClick={() => startManual('real_estate')}
                />
                <AddOption
                  title="Company equity"
                  subtitle={`${addCounts.equity} added`}
                  badge="New"
                  icon={<ClockIcon />}
                  onClick={() => startManual('espp')}
                />
                <AddOption
                  title="Import transaction & balance history"
                  subtitle="Import from CSV"
                  icon={<UploadIcon />}
                  onClick={() => { window.location.href = '/upload'; }}
                />
              </div>
              <button type="button" className="acctset-manual-btn" onClick={() => startManual()}>
                Add manual account
              </button>
            </>
          ) : (
            <>
          <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Naboo Royal Checking" /></label>
          <div className="row-2">
            <label>Type
              <select value={type} onChange={(e) => setType(e.target.value as AcctType)}>
                <option value="">Select account type…</option>
                {ACCOUNT_TYPE_GROUPS.map((grp) => (
                  <optgroup key={grp.key} label={grp.label}>
                    {ACCOUNT_TYPES.filter((t) => t.group === grp.key).map((t) => (
                      <option key={t.slug} value={t.slug}>{t.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>Last 4<input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} placeholder="1138" /></label>
          </div>
          <label>Institution
            <select value={institutionChoice} onChange={(e) => setInstitutionChoice(e.target.value)}>
              <option value="">Select institution…</option>
              {COMMON_INSTITUTIONS.map((inst) => <option key={inst.name} value={inst.name}>{inst.name}</option>)}
              <option value={CUSTOM_INSTITUTION}>Type your own…</option>
            </select>
          </label>
          {institutionChoice === CUSTOM_INSTITUTION && (
            <div className="row-2">
              <label>Institution name<input value={customInstitution} onChange={(e) => setCustomInstitution(e.target.value)} placeholder="e.g. Galactic Credit Union" /></label>
              <label>Logo URL / domain<input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="galacticcu.com" /></label>
            </div>
          )}
          {isCard && (
            <div className="row-2">
              <label>Credit limit<input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" placeholder="12000" /></label>
              <label>APR %<input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" placeholder="24.99" /></label>
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          <div className="actions">
            <button className="pg-btn" onClick={() => setMode('chooser')} disabled={busy}>Back</button>
            <button className="pg-btn primary" onClick={submit} disabled={!canSubmit || busy}>{busy ? 'Adding…' : 'Add account'}</button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function getAddAccountCounts(accounts: AcctRow[]) {
  return accounts.reduce(
    (acc, account) => {
      const def = ACCOUNT_TYPES.find((t) => t.slug === account.type);
      if (account.type === 'espp') acc.equity += 1;
      else if (account.type === 'credit_card' || def?.group === 'banking') acc.banking += 1;
      else if (def?.group === 'investments' || def?.group === 'retirement' || def?.assetClass === 'liability') acc.investing += 1;
      else acc.more += 1;
      return acc;
    },
    { banking: 0, investing: 0, more: 0, equity: 0 },
  );
}

function AddOption({
  title,
  subtitle,
  logos,
  badge,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  logos?: { institution: string; domain: string }[];
  badge?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="acctset-add-option" onClick={onClick}>
      <span className="acctset-add-option-copy">
        <span>
          {title}
          {badge && <b>{badge}</b>}
        </span>
        <small>{subtitle}</small>
      </span>
      {logos && (
        <span className="acctset-add-option-logos">
          {logos.map((logo) => (
            <InstLogo key={logo.domain} institution={logo.institution} domainHint={logo.domain} />
          ))}
        </span>
      )}
      {icon && <span className="acctset-add-option-icon">{icon}</span>}
      <ArrowRight />
    </button>
  );
}

function ArrowRight() {
  return (
    <svg className="acctset-add-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3.5 9h10M9.5 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <path d="M11 14V5m0 0L7.5 8.5M11 5l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13.5v2.8c0 .9.7 1.7 1.7 1.7h8.6c.9 0 1.7-.7 1.7-1.7v-2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Merge modal ──────────────────────────────────────────────────────────────

function MergeModal({
  acct, accounts, busy, error, onClose, onMerge, onDeleteUnassigned,
}: {
  acct: AcctRow;
  accounts: AcctRow[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: (targetId: string) => void;
  onDeleteUnassigned: () => void;
}) {
  const [targetId, setTargetId] = useState('');
  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Delete {acct.name}</h2>
          <p className="acctset-modal-note">
            Move {acct.count.toLocaleString()} transaction{acct.count === 1 ? '' : 's'} into another account, or leave
            them unassigned and delete <b>{acct.name}</b>.
          </p>
          <label>Merge into
            <select autoFocus value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select an account…</option>
              {GROUPS.map((g) => {
                const opts = accounts.filter((x) => kindFor(x.type) === g && x.id !== acct.id);
                if (opts.length === 0) return null;
                return (
                  <optgroup key={g} label={g}>
                    {opts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.last4 ? ` ····${x.last4}` : ''}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </label>
          {error && <div className="error-banner">{error}</div>}
          <div className="actions">
            <button className="pg-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="pg-btn danger" onClick={onDeleteUnassigned} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete and leave unassigned'}
            </button>
            <button className="pg-btn primary" onClick={() => targetId && onMerge(targetId)} disabled={!targetId || busy}>{busy ? 'Merging…' : 'Merge'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

const Caret = ({ open, small }: { open: boolean; small?: boolean }) => (
  <svg className={`acctset-caret${open ? ' open' : ''}`} width={small ? 11 : 13} height={small ? 11 : 13}
    viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 2.5L8 6l-4 3.5" />
  </svg>
);
const Plus = () => (
  <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10M3 8h10" /></svg>
);
