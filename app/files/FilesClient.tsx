'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { IconUpload } from '@/components/nav-icons';
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
      <span className="inline-flex size-[18px] items-center justify-center rounded bg-surface-3 text-[9px] font-semibold text-text-tertiary">
        {instInitials(institution)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={faviconUrl(domain)} alt="" width={18} height={18} className="rounded" onError={() => setFailed(true)} />;
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

export function FilesClient({ rows: initialRows }: { rows: FileRow[] }) {
  const [rows, setRows] = useState<FileRow[]>(initialRows);
  const [confirm, setConfirm] = useState<FileRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [w, setW] = useState(DEFAULT_W);

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
      className="group absolute right-[-7px] top-0 z-10 flex h-full w-3.5 cursor-col-resize items-center justify-center"
      aria-hidden
    >
      <span className="h-3.5 w-px bg-transparent group-hover:bg-accent-500 transition-colors" />
    </span>
  );

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
      <p className="text-[13px] text-text-tertiary mb-6">
        {rows.length === 0
          ? 'Every statement you upload is parsed and stored here.'
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
        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div
            style={gridStyle}
            className="grid gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted text-center"
          >
            <div className="text-left">File Name</div>
            <div className="relative">Type{handle('type')}</div>
            <div className="relative">Account{handle('account')}</div>
            <div className="relative">Period{handle('period')}</div>
            <div className="relative">Transactions{handle('txns')}</div>
            <div className="relative">Status{handle('status')}</div>
            <div className="relative">Uploaded{handle('uploaded')}</div>
            <div />
          </div>
          <div className="flex flex-col">
            {rows.map((r) => (
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
                <div className="text-text-secondary truncate" title={r.detectedIssuer ?? undefined}>
                  {TYPE_LABEL[r.detectedType] ?? r.detectedType}
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
        </div>
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
