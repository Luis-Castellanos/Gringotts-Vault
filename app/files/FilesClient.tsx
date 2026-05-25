'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { IconSearch, IconUpload } from '@/components/nav-icons';
import { faviconUrl, instDomain, instInitials } from '@/lib/institution-logo';

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
  unknown: 'Unknown',
};

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
const DEFAULT_W = { type: 130, account: 150, period: 140, txns: 110, status: 100, uploaded: 150 };
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
    case 'type': return (r.accountType ?? r.detectedType).toLowerCase();
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

export function FilesClient({
  rows: initialRows,
  typeOptions,
}: {
  rows: FileRow[];
  typeOptions: { slug: string; label: string }[];
}) {
  const [rows, setRows] = useState<FileRow[]>(initialRows);
  const [confirm, setConfirm] = useState<FileRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [w, setW] = useState(DEFAULT_W);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'uploaded', dir: 'desc' });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => matches(r, q)) : rows;
    const sorted = [...filtered].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? c : -c;
    });
    return sorted;
  }, [rows, query, sort]);

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
    gridTemplateColumns: `minmax(160px,1fr) ${w.type}px ${w.account}px ${w.period}px ${w.txns}px ${w.status}px ${w.uploaded}px 44px`,
  };

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
          : query.trim()
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
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-full max-w-[340px]">
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
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div
            style={gridStyle}
            className="grid gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted text-center"
          >
            <button type="button" onClick={() => toggleSort('fileName')} className="inline-flex items-center gap-1 text-left uppercase hover:text-text-secondary transition-colors">File Name {caret('fileName')}</button>
            <div className="relative"><button type="button" onClick={() => toggleSort('type')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Type {caret('type')}</button>{handle('type')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('account')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Account {caret('account')}</button>{handle('account')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('period')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Period {caret('period')}</button>{handle('period')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('txns')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Transactions {caret('txns')}</button>{handle('txns')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Status {caret('status')}</button>{handle('status')}</div>
            <div className="relative"><button type="button" onClick={() => toggleSort('uploaded')} className="inline-flex items-center gap-1 uppercase hover:text-text-secondary transition-colors">Uploaded {caret('uploaded')}</button>{handle('uploaded')}</div>
            <div />
          </div>
          <div className="flex flex-col">
            {visible.map((r) => (
              <div
                key={r.id}
                style={gridStyle}
                className="grid gap-3 px-4 py-3 border-t border-border-subtle items-center text-[13px] text-center first:border-t-0"
              >
                <a
                  href={`/api/documents/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-left font-medium text-text-primary hover:text-accent-500 truncate transition-colors"
                  title={`${r.fileName} · ${fmtBytes(r.byteSize)} · open PDF`}
                >
                  {r.fileName}
                </a>
                <div className="min-w-0">
                  {r.accountId ? (
                    <select
                      value={r.accountType ?? ''}
                      onChange={(e) => changeType(r, e.target.value)}
                      className="mx-auto max-w-full rounded-md border border-border-subtle bg-surface-1 px-1.5 py-0.5 text-[12px] text-text-secondary focus:outline-none focus:border-border-strong"
                      title="Account type — changing this re-types the account"
                    >
                      {r.accountType && !typeOptions.some((o) => o.slug === r.accountType) && (
                        <option value={r.accountType}>{r.accountType}</option>
                      )}
                      {typeOptions.map((o) => (
                        <option key={o.slug} value={o.slug}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-text-secondary truncate" title={r.detectedIssuer ?? undefined}>
                      {TYPE_LABEL[r.detectedType] ?? r.detectedType}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-1.5 min-w-0">
                  {r.last4 || r.institution ? (
                    r.accountId ? (
                      <Link href={`/accounts/${r.accountId}`} className="flex items-center gap-1.5 hover:text-accent-500 transition-colors min-w-0">
                        <InstLogo institution={r.institution ?? ''} />
                        <span className="text-text-secondary truncate">{r.last4 ? `····${r.last4}` : r.institution}</span>
                      </Link>
                    ) : (
                      <>
                        <InstLogo institution={r.institution ?? ''} />
                        <span className="text-text-secondary truncate">{r.last4 ? `····${r.last4}` : r.institution}</span>
                      </>
                    )
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
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
              No files match “{query.trim()}”.
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
    </>
  );
}
