'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ACCOUNT_TYPES, ACCOUNT_TYPE_GROUPS, accountTypeLabel, assetClassForType } from '@/lib/account-types';

// Account type is now an open taxonomy slug (see lib/account-types.ts), not a
// fixed union, so the list can be edited in Settings.
export type AcctType = string;

export type AcctRow = {
  id: string;
  name: string;
  institution: string;
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
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Institution logo (favicon by domain + initials fallback) ─────────────────
const INST_DOMAINS: Record<string, string> = {
  'Chase': 'chase.com', 'Bank of America': 'bankofamerica.com', 'American Express': 'americanexpress.com',
  'Capital One': 'capitalone.com', 'Discover': 'discover.com', 'Citi': 'citi.com', 'Ally Bank': 'ally.com',
  'U.S. Bank': 'usbank.com', 'Charles Schwab': 'schwab.com', 'Fidelity': 'fidelity.com', 'Vanguard': 'vanguard.com',
  'Apple / Goldman Sachs': 'apple.com', 'Goldman Sachs / Apple': 'apple.com', 'Apple / Green Dot Bank': 'apple.com',
  'Synchrony Bank / Venmo': 'venmo.com', 'Gain Federal Credit Union': 'gainfcu.com',
};
function instDomain(inst: string): string | null {
  if (!inst) return null;
  if (INST_DOMAINS[inst]) return INST_DOMAINS[inst];
  return inst.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}
function InstLogo({ institution }: { institution: string }) {
  const domain = instDomain(institution);
  const initial = (institution || '?').split(/[\s/-]/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const [failed, setFailed] = useState(false);
  return (
    <span className="acctset-logo">
      {!failed && domain ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" onError={() => setFailed(true)} />
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

export function AccountsSettingsClient({ accounts }: { accounts: AcctRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');
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
          <InstLogo institution={a.institution} />
          <span className="acctset-name">
            <span style={{ marginRight: 6 }}>{a.icon}</span>{a.name}
            {!a.isActive && <span className="acctset-badge">Closed</span>}
            <span className="acctset-rowsub">
              {a.institution || '—'}{a.last4 ? ` · ····${a.last4}` : ''} · {accountTypeLabel(a.type)}
            </span>
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
          <InstLogo institution={a.institution} />
          <div className="acctset-card-id">
            <span className="acctset-card-name">
              <span style={{ marginRight: 6 }}>{a.icon}</span>{a.name}{!a.isActive && <span className="acctset-badge">Closed</span>}
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

  return (
    <div className="acctset">
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
              <Caret open={!isCollapsed} />
              <h2>{top} <span className="acctset-count">{accts.length}</span></h2>
              <span className="acctset-section-total numeric">{usd.format(total)}</span>
            </button>
            {!isCollapsed &&
              TYPE_ORDER.filter((t) => byType.has(t)).map((t) => {
                const typeRows = byType.get(t)!.slice().sort((a, b) => a.name.localeCompare(b.name));
                const typeTotal = typeRows.reduce((s, a) => s + a.balance, 0);
                return (
                  <div key={t} className="acctset-subgroup">
                    <div className="acctset-subgroup-head">
                      <span className="acctset-subgroup-name">{accountTypeLabel(t)}</span>
                      <span className="acctset-subgroup-count">{typeRows.length}</span>
                      <span className="acctset-subgroup-total numeric">{usd.format(typeTotal)}</span>
                    </div>
                    {view === 'grid'
                      ? <div className="acctset-grid">{orderRows(t, typeRows).map((a, _i, arr) => renderCard(a, t, arr))}</div>
                      : <ul className="acctset-list">{typeRows.map(renderAccount)}</ul>}
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
                  <InstLogo institution={a.institution} />
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

      {modal?.mode === 'merge' ? (
        <MergeModal
          acct={modal.acct}
          accounts={accounts}
          busy={busy}
          error={error}
          onClose={() => { setModal(null); setError(null); }}
          onMerge={(targetId) => call('POST', `/api/accounts/${modal.acct.id}/merge`, { targetId })}
        />
      ) : modal?.mode === 'add' ? (
        <AddModal
          busy={busy}
          error={error}
          onClose={() => { setModal(null); setError(null); }}
          onCreate={(payload) => call('POST', '/api/accounts', payload)}
        />
      ) : null}
    </div>
  );
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
        {isInvest && <Field label="Subtype"><input value={accountSubtype} onChange={(e) => setAccountSubtype(e.target.value)} placeholder="Roth / 401(k) / HSA…" /></Field>}
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
  busy, error, onClose, onCreate,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AcctType>('checking');
  const [institution, setInstitution] = useState('');
  const [last4, setLast4] = useState('');
  const isCard = type === 'credit_card';
  const [creditLimit, setCreditLimit] = useState('');
  const [apr, setApr] = useState('');

  function submit() {
    onCreate({
      name: name.trim(),
      type,
      institution: institution.trim() || null,
      accountNumber: last4.trim() || null,
      creditLimit: isCard && creditLimit ? Number(creditLimit) : null,
      apr: isCard && apr ? Number(apr) : null,
    });
  }

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Add account</h2>
          <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Checking" /></label>
          <div className="row-2">
            <label>Type
              <select value={type} onChange={(e) => setType(e.target.value as AcctType)}>
                {ACCOUNT_TYPE_GROUPS.map((grp) => (
              <optgroup key={grp.key} label={grp.label}>
                {ACCOUNT_TYPES.filter((t) => t.group === grp.key).map((t) => (
                  <option key={t.slug} value={t.slug}>{t.label}</option>
                ))}
              </optgroup>
            ))}
              </select>
            </label>
            <label>Last 4<input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} placeholder="1234" /></label>
          </div>
          <label>Institution<input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" /></label>
          {isCard && (
            <div className="row-2">
              <label>Credit limit<input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" placeholder="10000" /></label>
              <label>APR %<input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" placeholder="24.99" /></label>
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          <div className="actions">
            <button className="pg-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="pg-btn primary" onClick={submit} disabled={!name.trim() || busy}>{busy ? 'Adding…' : 'Add account'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Merge modal ──────────────────────────────────────────────────────────────

function MergeModal({
  acct, accounts, busy, error, onClose, onMerge,
}: {
  acct: AcctRow;
  accounts: AcctRow[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: (targetId: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
          <h2>Merge {acct.name}</h2>
          <p className="acctset-modal-note">
            Move {acct.count.toLocaleString()} transaction{acct.count === 1 ? '' : 's'} from <b>{acct.name}</b> into
            another account, then delete <b>{acct.name}</b>. Use this to fix a duplicate.
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
