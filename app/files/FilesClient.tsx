'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { IconSearch, IconUpload } from '@/components/nav-icons';
import { faviconUrl, instDomain, instInitials } from '@/lib/institution-logo';
import { Select } from '@/components/Select';

export type FileRow = {
  id: string;
  fileName: string;
  detectedType: string;
  detectedIssuer: string | null;
  statementPeriod: string | null;
  status: string;
  transactionCount: number;
  byteSize: number;
  parseError: string | null;
  uploadedAt: string; // ISO
  accountId: string | null;
  accountType: string | null;
  institution: string | null;
  last4: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  credit_card: 'Credit card',
  bank: 'Bank',
  investment: 'Investment',
  paystub: 'Paystub',
  loan: 'Loan',
  unknown: 'Unknown',
};

// Editable document-type options (the kind of PDF, distinct from account type).
const DOC_TYPE_OPTIONS = [
  { value: 'bank', label: 'Bank' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'investment', label: 'Investment' },
  { value: 'paystub', label: 'Paystub' },
  { value: 'loan', label: 'Loan' },
  { value: 'unknown', label: 'Unknown' },
];

const STATUS_STYLE: Record<string, string> = {
  parsed: 'bg-positive/15 text-positive',
  parsing: 'bg-accent-500/15 text-accent-500',
  deferred: 'bg-accent-soft text-accent-300',
  duplicate: 'bg-surface-3 text-text-tertiary',
  failed: 'bg-negative/15 text-negative',
};

// Resizable columns: File Name flexes (1fr), the rest are draggable px widths,
// the trailing action column is fixed. Widths persist in localStorage.
const MIN_W = 70;
const DEFAULT_W = { docType: 120, type: 130, account: 150, period: 140, txns: 110, status: 100, uploaded: 150 };
type ColKey = keyof typeof DEFAULT_W;
const COL_STORAGE_KEY = 'vault-files-col-widths';

// ── Sorting ──────────────────────────────────────────────────────────────────
type SortKey = 'fileName' | ColKey;
type SortDir = 'asc' | 'desc';

// Statement period like "11/25/2019 - 12/09/2019" → sortable YYYYMMDD of its start.
function periodStart(p: string): string {
  const m = p.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}${m[1]}${m[2]}` : p;
}
function sortVal(r: FileRow, key: SortKey): string | number {
  switch (key) {
    case 'fileName': return r.fileName.toLowerCase();
    case 'docType': return (TYPE_LABEL[r.detectedType] ?? r.detectedType).toLowerCase();
    case 'type': return (r.accountType ?? '').toLowerCase();
    case 'account': return `${r.institution ?? ''}${r.last4 ?? ''}`.toLowerCase();
    case 'period': return r.statementPeriod ? periodStart(r.statementPeriod) : '';
    case 'txns': return r.transactionCount ?? 0;
    case 'status': return r.status;
    case 'uploaded': return r.uploadedAt;
  }
}
// Numeric/recency columns feel right defaulting to descending.
const DESC_FIRST: SortKey[] = ['txns', 'uploaded'];

function matches(r: FileRow, q: string): boolean {
  return [r.fileName, r.institution, r.last4, r.accountType, TYPE_LABEL[r.detectedType] ?? r.detectedType, r.detectedIssuer, r.statementPeriod, r.status]
    .some((f) => f != null && String(f).toLowerCase().includes(q));
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function InstLogo({ institution }: { institution: string }) {
  const domain = instDomain(institution);
  const [failed, setFailed] = useState(false);
  if (failed || !domain) {
    return (
      <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-surface-3 text-[9px] font-semibold text-text-tertiary">
        {instInitials(institution)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={faviconUrl(domain)} alt="" width={18} height={18} className="rounded-full" onError={() => setFailed(true)} />;
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 4l3 3 3-3" />
    </svg>
  );
}

// A compact multi-select facet (flat list — status / type / account have no
// hierarchy). Empty selection = no filter. Counts reflect the full set.
function FacetFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string; count: number }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;
  const toggle = (v: string) => {
    const n = new Set(selected);
    if (n.has(v)) n.delete(v); else n.add(v);
    onChange(n);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${active ? 'border-accent-border bg-accent-soft text-text-primary' : 'border-border-subtle bg-surface-1 text-text-secondary hover:border-border-strong'}`}
      >
        {label}{active ? ` · ${selected.size}` : ''}
        <span className="text-text-muted"><Chevron /></span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-[220px] rounded-lg border border-border-strong bg-surface-base p-1.5 shadow-xl">
            {active && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-text-tertiary hover:bg-surface-2 transition-colors"
              >
                Clear {label.toLowerCase()}
              </button>
            )}
            <div className="max-h-[280px] overflow-y-auto">
              {options.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text-primary hover:bg-surface-2">
                  <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: 'var(--color-accent-500)' }} />
                  <span className="flex-1 truncate capitalize">{o.label}</span>
                  <span className="text-[11px] tabular-nums text-text-muted">{o.count}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type AccountOption = { value: string; label: string; last4: string | null; institution: string | null; type: string };

export function FilesClient({
  rows: initialRows,
  typeOptions,
  accountOptions,
}: {
  rows: FileRow[];
  typeOptions: { slug: string; label: string }[];
  accountOptions: AccountOption[];
}) {
  const [rows, setRows] = useState<FileRow[]>(initialRows);
  const [confirm, setConfirm] = useState<FileRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [w, setW] = useState(DEFAULT_W);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'uploaded', dir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [statusF, setStatusF] = useState<Set<string>>(new Set());
  const [docTypeF, setDocTypeF] = useState<Set<string>>(new Set());
  const [acctF, setAcctF] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const lastIndexRef = useRef<number | null>(null);

  const acctById = useMemo(() => new Map(accountOptions.map((a) => [a.value, a])), [accountOptions]);
  const acctSelectOptions = useMemo(() => accountOptions.map((a) => ({ value: a.value, label: a.label })), [accountOptions]);
  const typeSelectOptions = useMemo(() => typeOptions.map((o) => ({ value: o.slug, label: o.label })), [typeOptions]);

  // Facet options (with live counts) derived from the full set.
  const facets = useMemo(() => {
    const status = new Map<string, number>();
    const docType = new Map<string, number>();
    const account = new Map<string, { label: string; count: number }>();
    for (const r of rows) {
      status.set(r.status, (status.get(r.status) ?? 0) + 1);
      docType.set(r.detectedType, (docType.get(r.detectedType) ?? 0) + 1);
      const key = r.accountId ?? '__unassigned__';
      const label = r.accountId ? `${r.institution ?? 'Account'}${r.last4 ? ` ····${r.last4}` : ''}` : 'Unassigned';
      const cur = account.get(key) ?? { label, count: 0 };
      cur.count += 1;
      account.set(key, cur);
    }
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return {
      status: [...status].map(([value, count]) => ({ value, label: cap(value), count })).sort((a, b) => a.label.localeCompare(b.label)),
      docType: [...docType].map(([value, count]) => ({ value, label: TYPE_LABEL[value] ?? value, count })).sort((a, b) => a.label.localeCompare(b.label)),
      account: [...account].map(([value, v]) => ({ value, label: v.label, count: v.count })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!q || matches(r, q)) &&
      (statusF.size === 0 || statusF.has(r.status)) &&
      (docTypeF.size === 0 || docTypeF.has(r.detectedType)) &&
      (acctF.size === 0 || acctF.has(r.accountId ?? '__unassigned__')),
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? c : -c;
    });
    return sorted;
  }, [rows, query, sort, statusF, docTypeF, acctF]);

  const filtersActive = query.trim() !== '' || statusF.size > 0 || docTypeF.size > 0 || acctF.size > 0;
  function clearFilters() { setQuery(''); setStatusF(new Set()); setDocTypeF(new Set()); setAcctF(new Set()); }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DESC_FIRST.includes(key) ? 'desc' : 'asc' },
    );
  }
  const caret = (key: SortKey) =>
    sort.key === key ? <span className="text-[8px] leading-none">{sort.dir === 'asc' ? '▲' : '▼'}</span> : null;

  useEffect(() => {
    try {
      const s = localStorage.getItem(COL_STORAGE_KEY);
      if (s) setW((prev) => ({ ...prev, ...JSON.parse(s) }));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(w));
    } catch {
      /* ignore */
    }
  }, [w]);

  const gridStyle = {
    gridTemplateColumns: `34px minmax(160px,1fr) ${w.docType}px ${w.type}px ${w.account}px ${w.period}px ${w.txns}px ${w.status}px ${w.uploaded}px 44px`,
  };

  function applyAccountLocal(rowId: string, accountId: string) {
    const opt = acctById.get(accountId);
    setRows((rs) => rs.map((r) => (r.id === rowId
      ? { ...r, accountId, institution: opt?.institution ?? null, last4: opt?.last4 ?? null, accountType: opt?.type ?? r.accountType }
      : r)));
  }
  async function reassignAccount(row: FileRow, accountId: string) {
    if (!accountId || accountId === row.accountId) return;
    const prev = { accountId: row.accountId, institution: row.institution, last4: row.last4, accountType: row.accountType };
    applyAccountLocal(row.id, accountId);
    setError(null);
    const res = await fetch(`/api/documents/${row.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      setError(json.error.message ?? 'Could not reassign account.');
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...prev } : r)));
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  function toggleSelectAll() {
    setSelected(() => (allVisibleSelected ? new Set() : new Set(visible.map((r) => r.id))));
  }
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  const selectedRows = () => rows.filter((r) => selected.has(r.id));

  async function bulkSetType(slug: string) {
    setBulkBusy(true); setError(null);
    for (const r of selectedRows()) {
      if (!r.accountId) continue;
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, accountType: slug } : x)));
      await fetch(`/api/accounts/${r.accountId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: slug }) });
    }
    setBulkBusy(false);
  }
  async function bulkSetDocType(docType: string) {
    setBulkBusy(true); setError(null);
    for (const r of selectedRows()) {
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, detectedType: docType } : x)));
      await fetch(`/api/documents/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ detectedType: docType }) });
    }
    setBulkBusy(false);
  }
  async function bulkSetAccount(accountId: string) {
    setBulkBusy(true); setError(null);
    for (const r of selectedRows()) {
      applyAccountLocal(r.id, accountId);
      await fetch(`/api/documents/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }) });
    }
    setBulkBusy(false);
  }
  async function doBulkRemove(withData: boolean) {
    setBulkBusy(true); setError(null);
    for (const id of [...selected]) {
      await fetch(`/api/documents/${id}${withData ? '?withData=1' : ''}`, { method: 'DELETE' });
    }
    setRows((rs) => rs.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setBulkBusy(false);
    setBulkConfirm(false);
  }

  // Shift-click selects the contiguous range from the last toggled row.
  function onRowCheck(shift: boolean, id: string, index: number) {
    if (shift && lastIndexRef.current !== null) {
      const [a, b] = [lastIndexRef.current, index].sort((x, y) => x - y);
      const ids = visible.slice(a, b + 1).map((r) => r.id);
      setSelected((s) => { const n = new Set(s); ids.forEach((i) => n.add(i)); return n; });
    } else {
      toggleSelect(id);
    }
    lastIndexRef.current = index;
  }
  const bulkTxnTotal = useMemo(
    () => rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + (r.status === 'parsed' ? r.transactionCount : 0), 0),
    [rows, selected],
  );

  function startResize(e: React.PointerEvent, key: ColKey) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = w[key];
    function move(ev: PointerEvent) {
      setW((prev) => ({ ...prev, [key]: Math.max(MIN_W, startW + (ev.clientX - startX)) }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const handle = (key: ColKey) => (
    <span
      onPointerDown={(e) => startResize(e, key)}
      onClick={(e) => e.stopPropagation()}
      className="group absolute right-[-6px] top-0 z-20 flex h-full w-3 cursor-col-resize items-center justify-center"
      aria-hidden
      title="Drag to resize"
    >
      {/* always-visible divider so the column edge reads as draggable */}
      <span className="h-1/2 w-[1.5px] rounded bg-border-strong group-hover:bg-accent-500 group-hover:h-full transition-all" />
    </span>
  );

  // Changing a file's Type re-types its matched account (and any sibling files
  // pointing at the same account). Optimistic, with revert on failure.
  async function changeType(row: FileRow, slug: string) {
    const acctId = row.accountId;
    if (!acctId || slug === row.accountType) return;
    const prev = row.accountType;
    setRows((rs) => rs.map((r) => (r.accountId === acctId ? { ...r, accountType: slug } : r)));
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${acctId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.error) {
        setError(json.error.message ?? 'Could not change type.');
        setRows((rs) => rs.map((r) => (r.accountId === acctId ? { ...r, accountType: prev } : r)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change type.');
      setRows((rs) => rs.map((r) => (r.accountId === acctId ? { ...r, accountType: prev } : r)));
    }
  }

  // Set a file's document type (the kind of PDF). Independent of the account.
  async function changeDocType(row: FileRow, docType: string) {
    if (docType === row.detectedType) return;
    const prev = row.detectedType;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, detectedType: docType } : r)));
    setError(null);
    try {
      const res = await fetch(`/api/documents/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detectedType: docType }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.error) {
        setError(json.error.message ?? 'Could not change document type.');
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, detectedType: prev } : r)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change document type.');
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, detectedType: prev } : r)));
    }
  }

  async function remove(row: FileRow, withData: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${row.id}${withData ? '?withData=1' : ''}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        setError(json.error.message ?? 'Could not remove file.');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Files</h1>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-accent-500 hover:brightness-110 text-white text-[13px] font-medium px-3.5 py-2 transition-colors"
        >
          <IconUpload size={16} />
          Upload statements
        </Link>
      </div>
      <p className="text-[13px] text-text-tertiary mb-5">
        {rows.length === 0
          ? 'Every statement you upload is parsed and stored here.'
          : filtersActive
            ? `${visible.length} of ${rows.length} ${rows.length === 1 ? 'document' : 'documents'} match.`
            : `${rows.length} ${rows.length === 1 ? 'document' : 'documents'} · the original PDF of each is stored and downloadable.`}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-[13px] text-negative">{error}</div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center">
          <div className="mx-auto mb-3 size-10 rounded-full bg-surface-2 flex items-center justify-center text-text-tertiary">
            <IconUpload size={20} />
          </div>
          <div className="text-[15px] font-medium mb-1">No statements yet</div>
          <div className="text-[13px] text-text-tertiary mb-5">
            Upload bank, card, or other statement PDFs and Vault will sort out the rest.
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-500 hover:brightness-110 text-white text-[13px] font-medium px-3.5 py-2 transition-colors"
          >
            <IconUpload size={16} />
            Upload statements
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[300px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <IconSearch size={15} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search file name, account, type, period…"
                className="w-full rounded-lg border border-border-subtle bg-surface-1 pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong"
              />
            </div>
            <FacetFilter label="Status" options={facets.status} selected={statusF} onChange={setStatusF} />
            <FacetFilter label="Type" options={facets.docType} selected={docTypeF} onChange={setDocTypeF} />
            <FacetFilter label="Account" options={facets.account} selected={acctF} onChange={setAcctF} />
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors">
                Clear filters
              </button>
            )}
          </div>
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent-border bg-accent-soft px-4 py-2.5">
              <span className="text-[13px] font-medium text-text-primary">{selected.size} selected</span>
              <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                <span>Doc type</span>
                <Select value="" onChange={bulkSetDocType} options={DOC_TYPE_OPTIONS} className="vsel-sm" placeholder="Choose…" ariaLabel="Set document type for selected" />
                <span>· account type</span>
                <Select value="" onChange={bulkSetType} options={typeSelectOptions} className="vsel-sm" placeholder="Choose…" ariaLabel="Set account type for selected" />
                <span>· account</span>
                <Select value="" onChange={bulkSetAccount} options={acctSelectOptions} className="vsel-sm" placeholder="Choose…" ariaLabel="Set account for selected" />
              </div>
              <div className="flex-1" />
              <button type="button" onClick={() => setBulkConfirm(true)} disabled={bulkBusy} className="rounded-md border border-negative/30 text-negative hover:bg-negative/10 text-[12px] font-medium px-3 py-1.5 transition-colors disabled:opacity-50">
                Remove
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors">
                Clear
              </button>
            </div>
          )}
          <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div
            style={gridStyle}
            className="grid gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted text-center"
          >
            <div className="flex items-center justify-center">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all" style={{ accentColor: 'var(--color-accent-500)' }} />
            </div>
            <button type="button" onClick={() => toggleSort('fileName')} className="inline-flex items-center gap-1 text-left uppercase hover:text-text-secondary transition-colors">File Name {caret('fileName')}</button>
            <div className="relative"><button type="button" onClick={() => toggleSort('docType')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Document type {caret('docType')}</button>{handle('docType')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('type')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Account type {caret('type')}</button>{handle('type')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('account')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Account {caret('account')}</button>{handle('account')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('period')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Period {caret('period')}</button>{handle('period')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('txns')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Transactions {caret('txns')}</button>{handle('txns')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Status {caret('status')}</button>{handle('status')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('uploaded')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Uploaded {caret('uploaded')}</button>{handle('uploaded')}</div>
            <div />
          </div>
          <div className="flex flex-col">
            {visible.map((r, index) => (
              <div
                key={r.id}
                style={gridStyle}
                className={`grid gap-3 px-4 py-3 border-t border-border-subtle items-center text-[13px] text-center first:border-t-0 ${selected.has(r.id) ? 'bg-accent-soft/40' : ''}`}
              >
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => onRowCheck((e.nativeEvent as MouseEvent).shiftKey, r.id, index)}
                    aria-label={`Select ${r.fileName}`}
                    style={{ accentColor: 'var(--color-accent-500)' }}
                  />
                </div>
                <a
                  href={`/api/documents/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-left font-medium text-text-primary hover:text-accent-500 truncate transition-colors"
                  title={`${r.fileName} · ${fmtBytes(r.byteSize)} · open PDF`}
                >
                  {r.fileName}
                </a>
                <div className="flex justify-center min-w-0">
                  <Select value={r.detectedType} onChange={(v) => changeDocType(r, v)} options={DOC_TYPE_OPTIONS} className="vsel-sm" ariaLabel="Document type" />
                </div>
                <div className="flex justify-center min-w-0">
                  {r.accountId ? (
                    <Select value={r.accountType ?? ''} onChange={(v) => changeType(r, v)} options={typeSelectOptions} className="vsel-sm" ariaLabel="Account type" />
                  ) : (
                    <span className="text-text-muted" title="Assign an account to set its type">—</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-1.5 min-w-0">
                  {(r.institution || r.last4) && <InstLogo institution={r.institution ?? ''} />}
                  <Select value={r.accountId ?? ''} onChange={(v) => reassignAccount(r, v)} options={acctSelectOptions} className="vsel-sm min-w-0" ariaLabel="Account" placeholder="Unassigned" />
                </div>
                <div className="text-text-tertiary tabular-nums truncate" title={r.statementPeriod ?? undefined}>
                  {r.statementPeriod ?? '—'}
                </div>
                <div className="tabular-nums text-text-secondary">{r.status === 'parsed' ? r.transactionCount : '—'}</div>
                <div className="flex justify-center">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[r.status] ?? 'bg-surface-3 text-text-tertiary'}`}
                    title={r.parseError ?? undefined}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-text-tertiary tabular-nums text-[12px]">{fmtDate(r.uploadedAt)}</div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => { setError(null); setConfirm(r); }}
                    className="text-text-muted hover:text-negative transition-colors p-1 rounded"
                    aria-label={`Remove ${r.fileName}`}
                    title="Remove file"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="px-4 py-12 text-center text-[13px] text-text-tertiary border-t border-border-subtle">
              No files match the current filters. <button type="button" onClick={clearFilters} className="text-accent-500 hover:underline">Clear filters</button>
            </div>
          )}
          </div>
        </>
      )}

      {/* Remove confirmation */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !busy && setConfirm(null)}
        >
          <div
            className="w-full max-w-[440px] rounded-xl border border-border-subtle bg-surface-base p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold mb-1">Remove this file?</div>
            <div className="text-[13px] text-text-tertiary mb-1 truncate" title={confirm.fileName}>
              {confirm.fileName}
            </div>
            <p className="text-[13px] text-text-secondary mb-5">
              {confirm.status === 'parsed' && confirm.transactionCount > 0 ? (
                <>
                  This file imported <b>{confirm.transactionCount}</b> transactions. Remove just the file (keep the
                  transactions), or remove the file <b>and</b> all data it imported?
                </>
              ) : (
                <>The stored PDF will be deleted. This file has no imported transactions to remove.</>
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(confirm, false)}
                className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-60"
              >
                Remove file only
              </button>
              {confirm.status === 'parsed' && confirm.transactionCount > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(confirm, true)}
                  className="rounded-lg bg-negative px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 transition-colors disabled:opacity-60"
                >
                  {busy ? 'Removing…' : `Remove file + ${confirm.transactionCount} rows`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk remove confirmation */}
      {bulkConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !bulkBusy && setBulkConfirm(false)}
        >
          <div
            className="w-full max-w-[460px] rounded-xl border border-border-subtle bg-surface-base p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-semibold mb-1">
              Remove {selected.size} file{selected.size === 1 ? '' : 's'}?
            </div>
            <p className="text-[13px] text-text-secondary mb-5">
              {bulkTxnTotal > 0 ? (
                <>
                  The selected files imported <b>{bulkTxnTotal.toLocaleString()}</b> transactions. Remove just
                  the files (keep the transactions), or remove the files <b>and</b> all data they imported?
                </>
              ) : (
                <>The stored PDFs will be deleted. The selected files have no imported transactions to remove.</>
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm(false)}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => doBulkRemove(false)}
                className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] font-medium text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-60"
              >
                {bulkBusy ? 'Removing…' : 'Remove files only'}
              </button>
              {bulkTxnTotal > 0 && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => doBulkRemove(true)}
                  className="rounded-lg bg-negative px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 transition-colors disabled:opacity-60"
                >
                  {bulkBusy ? 'Removing…' : `Remove files + ${bulkTxnTotal.toLocaleString()} rows`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
