import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { IconUpload } from '@/components/nav-icons';

export const metadata = { title: 'Files · Vault' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  credit_card: 'Credit card',
  bank: 'Bank',
  investment: 'Investment',
  paystub: 'Paystub',
  mortgage: 'Mortgage',
  auto_loan: 'Auto loan',
  loan: 'Loan',
  unknown: 'Unknown',
};

const STATUS_STYLE: Record<string, string> = {
  parsed: 'bg-positive/15 text-positive',
  parsing: 'bg-accent-500/15 text-accent-500',
  deferred: 'bg-accent-soft text-accent-300',
  duplicate: 'bg-surface-3 text-text-tertiary',
  failed: 'bg-negative/15 text-negative',
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function FilesPage() {
  const rows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      detectedType: documents.detectedType,
      detectedIssuer: documents.detectedIssuer,
      accountIds: documents.accountIds,
      accountLabel: documents.accountLabel,
      statementPeriod: documents.statementPeriod,
      status: documents.status,
      transactionCount: documents.transactionCount,
      byteSize: documents.byteSize,
      parseError: documents.parseError,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .orderBy(desc(documents.uploadedAt));

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1400px] px-10 pt-8 pb-20">
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
              <div className="grid grid-cols-[1fr_120px_1fr_150px_70px_110px_150px] gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted">
                <div>File</div>
                <div>Type</div>
                <div>Account</div>
                <div>Period</div>
                <div className="text-right">Rows</div>
                <div>Status</div>
                <div className="text-right">Uploaded</div>
              </div>
              <div className="flex flex-col">
                {rows.map((r) => {
                  const accountId = r.accountIds?.[0];
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[1fr_120px_1fr_150px_70px_110px_150px] gap-3 px-4 py-3 border-t border-border-subtle items-center text-[13px] first:border-t-0"
                    >
                      <a
                        href={`/api/documents/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-text-primary hover:text-accent-500 truncate transition-colors"
                        title={`${r.fileName} · ${fmtBytes(r.byteSize)} · open PDF`}
                      >
                        {r.fileName}
                      </a>
                      <div className="text-text-secondary truncate" title={r.detectedIssuer ?? undefined}>
                        {TYPE_LABEL[r.detectedType] ?? r.detectedType}
                      </div>
                      <div className="text-text-secondary truncate" title={r.accountLabel ?? undefined}>
                        {r.accountLabel ? (
                          accountId ? (
                            <Link href={`/accounts/${accountId}`} className="hover:text-accent-500 transition-colors">
                              {r.accountLabel}
                            </Link>
                          ) : (
                            r.accountLabel
                          )
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                      <div className="text-text-tertiary tabular-nums truncate" title={r.statementPeriod ?? undefined}>
                        {r.statementPeriod ?? '—'}
                      </div>
                      <div className="text-right tabular-nums text-text-secondary">
                        {r.status === 'parsed' ? r.transactionCount : '—'}
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                            STATUS_STYLE[r.status] ?? 'bg-surface-3 text-text-tertiary'
                          }`}
                          title={r.parseError ?? undefined}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div className="text-right text-text-tertiary tabular-nums text-[12px]">
                        {fmtDate(r.uploadedAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
