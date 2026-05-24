'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type AcctType =
  | 'checking' | 'savings' | 'credit_card' | 'brokerage'
  | 'retirement' | 'loan' | 'cash' | 'other';

export type AcctRow = {
  id: string;
  name: string;
  institution: string;
  last4: string;
  type: AcctType;
  assetClass: 'asset' | 'liability';
  isActive: boolean;
  openedDate: string | null;
  creditLimit: number | null;
  apr: number | null;
  count: number;
  balance: number;
};

type Group = 'Cash' | 'Investments' | 'Liabilities' | 'Other';
const GROUPS: Group[] = ['Cash', 'Investments', 'Liabilities', 'Other'];
const KIND: Record<AcctType, Group> = {
  checking: 'Cash', savings: 'Cash', cash: 'Cash',
  brokerage: 'Investments', retirement: 'Investments',
  credit_card: 'Liabilities', loan: 'Liabilities',
  other: 'Other',
};
const TYPE_LABEL: Record<AcctType, string> = {
  checking: 'Checking', savings: 'Savings', credit_card: 'Credit card',
  brokerage: 'Brokerage', retirement: 'Retirement', loan: 'Loan',
  cash: 'Cash', other: 'Other',
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as AcctType[];

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
  const [collapsed, setCollapsed] = useState<Set<Group>>(new Set());

  const toggleGroup = (g: Group) =>
    setCollapsed((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const visible = showClosed ? accounts : accounts.filter((a) => a.isActive);
  const closedCount = accounts.filter((a) => !a.isActive).length;

  const grouped = useMemo(() => {
    const m: Record<Group, AcctRow[]> = { Cash: [], Investments: [], Liabilities: [], Other: [] };
    for (const a of visible) m[KIND[a.type]].push(a);
    for (const g of GROUPS) m[g].sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [visible]);

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

  return (
    <div className="acctset">
      <header className="acctset-head">
        <div>
          <div className="eyebrow">Manage</div>
          <h1 className="acctset-title">Accounts</h1>
          <p className="acctset-sub">{accounts.length} accounts. Click any account to view details and edit. Merge duplicates, add, or remove.</p>
        </div>
        <button className="acctset-add" onClick={() => setModal({ mode: 'add' })}>
          <Plus /> Add account
        </button>
      </header>

      {error && (
        <div className="acctset-error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {GROUPS.map((g) => {
        const rows = grouped[g];
        if (rows.length === 0) return null;
        const isCollapsed = collapsed.has(g);
        const total = rows.reduce((s, a) => s + a.balance, 0);
        return (
          <section key={g} className={`acctset-section${isCollapsed ? ' collapsed' : ''}`}>
            <button className="acctset-section-head" onClick={() => toggleGroup(g)} aria-expanded={!isCollapsed}>
              <Caret open={!isCollapsed} />
              <h2>{g} <span className="acctset-count">{rows.length}</span></h2>
              <span className="acctset-section-total numeric">{usd.format(total)}</span>
            </button>
            {!isCollapsed && (
              <ul className="acctset-list">
                {rows.map((a) => {
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
                          {a.name}
                          {!a.isActive && <span className="acctset-badge">Closed</span>}
                          <span className="acctset-rowsub">
                            {a.institution || '—'}{a.last4 ? ` · ····${a.last4}` : ''} · {TYPE_LABEL[a.type]}
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
                })}
              </ul>
            )}
          </section>
        );
      })}

      {closedCount > 0 && (
        <button className="acctset-show-closed" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? 'Hide' : 'Show'} {closedCount} closed {closedCount === 1 ? 'account' : 'accounts'}
        </button>
      )}

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
  const isCard = acct.type === 'credit_card';
  const [name, setName] = useState(acct.name);
  const [institution, setInstitution] = useState(acct.institution);
  const [last4, setLast4] = useState(acct.last4);
  const [openedAt, setOpenedAt] = useState(acct.openedDate ?? '');
  const [creditLimit, setCreditLimit] = useState(acct.creditLimit != null ? String(acct.creditLimit) : '');
  const [apr, setApr] = useState(acct.apr != null ? String(acct.apr) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const util = isCard && acct.creditLimit ? (-acct.balance / acct.creditLimit) * 100 : null;
  const available = isCard && acct.creditLimit != null ? acct.creditLimit + acct.balance : null;

  async function save() {
    setSaving(true);
    setErr(null);
    const r = await patchAccount(acct.id, {
      name: name.trim(),
      institution: institution.trim() || null,
      accountNumber: last4.trim() || null,
      openedAt: openedAt || null,
      creditLimit: isCard && creditLimit ? Number(creditLimit) : null,
      apr: isCard && apr ? Number(apr) : null,
    });
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
        <Stat label="Type" value={TYPE_LABEL[acct.type]} />
        <Stat label="Status" value={acct.isActive ? 'Active' : 'Closed'} />
      </div>

      <div className="acctset-form">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Institution"><input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="—" /></Field>
        <Field label="Last 4"><input value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} placeholder="—" /></Field>
        <Field label="Opened"><input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} /></Field>
        {isCard && <Field label="Credit limit"><input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
        {isCard && <Field label="APR %"><input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" placeholder="—" /></Field>}
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
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
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
                const opts = accounts.filter((x) => KIND[x.type] === g && x.id !== acct.id);
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
