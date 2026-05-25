'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';

import { IconUpload, IconFiles } from '@/components/nav-icons';

type FileResult = {
  fileName: string;
  status: 'parsed' | 'failed' | 'deferred' | 'duplicate';
  type?: string;
  account?: string | null;
  statementPeriod?: string | null;
  transactionCount?: number;
  inserted?: number;
  skipped?: number;
  error?: string;
};
type UploadResponse = {
  summary: { total: number; parsed: number; failed: number; deferred: number; duplicate: number };
  results: FileResult[];
};

type PreviewResult = {
  fileName: string;
  status: 'new' | 'duplicate-file' | 'deferred' | 'failed' | 'paystub';
  type?: string;
  account?: string | null;
  accountExists?: boolean;
  statementPeriod?: string | null;
  totalRows?: number;
  newRows?: number;
  duplicateRows?: number;
  reconciles?: boolean | null;
  endDelta?: number | null;
  error?: string;
};
type PreviewResponse = {
  summary: { total: number; newRows: number; duplicateRows: number; discrepancies: number; duplicateFiles: number };
  results: PreviewResult[];
};

const STATUS_STYLE: Record<FileResult['status'], string> = {
  parsed: 'bg-positive/15 text-positive',
  deferred: 'bg-accent-soft text-accent-300',
  duplicate: 'bg-surface-3 text-text-tertiary',
  failed: 'bg-negative/15 text-negative',
};

function isPdf(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export function UploadClient() {
  const [staged, setStaged] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | File[]) => {
    const pdfs = Array.from(list).filter(isPdf);
    if (pdfs.length === 0) return;
    setResults(null);
    setPreview(null);
    setError(null);
    setStaged((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const f of pdfs) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(f);
        }
      }
      return next;
    });
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  async function runPreview() {
    if (staged.length === 0 || previewing) return;
    setPreviewing(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of staged) fd.append('files', f);
      const res = await fetch('/api/documents/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) setError(json.error.message ?? 'Preview failed.');
      else setPreview(json.data as PreviewResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewing(false);
    }
  }

  async function upload() {
    if (staged.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of staged) fd.append('files', f);
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.error) {
        setError(json.error.message ?? 'Upload failed.');
      } else {
        setResults(json.data as UploadResponse);
        setStaged([]);
        setPreview(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] mb-1">Upload statements</h1>
      <p className="text-[13px] text-text-tertiary mb-6">
        Drop in bank, credit-card, or other statement PDFs. Vault detects the account and type,
        extracts the transactions into your database, and keeps the original file. New transactions
        land in <Link href="/review" className="text-accent-500 hover:underline">Review</Link> to be categorized.
      </p>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed px-8 py-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-accent-500 bg-accent-500/5'
            : 'border-border-subtle bg-surface-1 hover:border-text-muted'
        }`}
      >
        <div className="mx-auto mb-3 size-11 rounded-full bg-surface-2 flex items-center justify-center text-text-secondary">
          <IconUpload size={22} />
        </div>
        <div className="text-[15px] font-medium mb-1">
          Drop PDFs here or <span className="text-accent-500">browse</span>
        </div>
        <div className="text-[12.5px] text-text-tertiary">
          Bank · credit card · more types coming. You can drop several at once.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Staged files */}
      {staged.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] text-text-secondary">
              {staged.length} {staged.length === 1 ? 'file' : 'files'} ready
            </div>
            <button
              type="button"
              onClick={() => setStaged([])}
              className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface-1 divide-y divide-border-subtle">
            {staged.map((f, i) => (
              <div key={`${f.name}:${f.size}`} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <IconFiles size={15} className="text-text-tertiary shrink-0" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-text-muted tabular-nums text-[12px]">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                  className="text-text-muted hover:text-negative transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={runPreview}
              disabled={previewing || uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-border-subtle hover:bg-surface-2 disabled:opacity-60 text-text-secondary text-[14px] font-medium px-4 py-2.5 transition-colors"
            >
              {previewing ? 'Checking…' : 'Preview (dry run)'}
            </button>
            <button
              type="button"
              onClick={upload}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-60 text-white text-[14px] font-medium px-4 py-2.5 transition-colors"
            >
              {uploading ? 'Parsing…' : `Upload & parse ${staged.length} ${staged.length === 1 ? 'file' : 'files'}`}
            </button>
          </div>

          {/* Dry-run preview */}
          {preview && (
            <div className="mt-5">
              <div className="text-[13px] text-text-secondary mb-2">
                Dry run — <b className="text-text-primary">{preview.summary.newRows}</b> new
                {preview.summary.duplicateRows > 0 && `, ${preview.summary.duplicateRows} already imported`}
                {preview.summary.discrepancies > 0 && `, ${preview.summary.discrepancies} don't reconcile`}
                {preview.summary.duplicateFiles > 0 && `, ${preview.summary.duplicateFiles} re-uploaded file(s)`}
                . Nothing written yet.
              </div>
              <div className="rounded-xl border border-border-subtle bg-surface-1 divide-y divide-border-subtle">
                {preview.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium truncate block">{r.fileName}</span>
                      <span className="text-text-tertiary text-[12px]">
                        {r.status === 'new' &&
                          `${r.account ?? 'account'}${r.accountExists ? '' : ' (new account)'} · ${r.newRows} new${
                            r.duplicateRows ? `, ${r.duplicateRows} dup` : ''
                          } of ${r.totalRows}${r.statementPeriod ? ` · ${r.statementPeriod}` : ''}`}
                        {r.status === 'duplicate-file' && 'Already uploaded — would be skipped'}
                        {r.status === 'paystub' && `Paystub · ${r.account ?? ''}`}
                        {r.status === 'deferred' && (r.error ?? 'Not supported yet')}
                        {r.status === 'failed' && (r.error ?? 'Could not parse')}
                      </span>
                    </span>
                    {r.status === 'new' && r.reconciles != null && (
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium shrink-0 ${r.reconciles ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative'}`}>
                        {r.reconciles ? 'reconciles' : `off ${r.endDelta != null ? (r.endDelta >= 0 ? '+' : '') + r.endDelta.toFixed(2) : ''}`}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium shrink-0 ${
                      r.status === 'new' ? 'bg-accent-soft text-accent-300'
                      : r.status === 'duplicate-file' ? 'bg-surface-3 text-text-tertiary'
                      : r.status === 'failed' ? 'bg-negative/15 text-negative'
                      : 'bg-surface-3 text-text-tertiary'
                    }`}>
                      {r.status === 'duplicate-file' ? 'duplicate' : r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-[13px] text-negative">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-medium">
              Done — {results.summary.parsed} parsed
              {results.summary.deferred > 0 && `, ${results.summary.deferred} deferred`}
              {results.summary.duplicate > 0 && `, ${results.summary.duplicate} duplicate`}
              {results.summary.failed > 0 && `, ${results.summary.failed} failed`}
            </div>
            <Link
              href="/files"
              className="inline-flex items-center gap-1.5 text-[13px] text-accent-500 hover:underline"
            >
              <IconFiles size={15} />
              View in Files
            </Link>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-1 divide-y divide-border-subtle">
            {results.results.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <span className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{r.fileName}</span>
                  <span className="text-text-tertiary text-[12px]">
                    {r.status === 'parsed' &&
                      `${r.account ?? 'account'} · ${r.inserted} new${r.skipped ? `, ${r.skipped} dup` : ''}${
                        r.statementPeriod ? ` · ${r.statementPeriod}` : ''
                      }`}
                    {r.status === 'deferred' && (r.error ?? 'Not supported yet')}
                    {r.status === 'duplicate' && 'Already uploaded'}
                    {r.status === 'failed' && (r.error ?? 'Could not parse')}
                  </span>
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize shrink-0 ${STATUS_STYLE[r.status]}`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
