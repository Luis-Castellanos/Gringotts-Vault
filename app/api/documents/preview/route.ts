/**
 * Dry-run an upload: parse the PDFs and report what *would* happen — detected
 * account/type/period, new vs duplicate transaction counts, statement
 * reconciliation, and whether the file itself is a re-upload — without writing
 * anything to the ledger or storing the file. Mirrors the parse phase of
 * /api/documents/upload, then calls the read-only previewIngest.
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { runExtractor } from '@/lib/parser/extract';
import { parserAvailable, PARSER_UNAVAILABLE_MESSAGE } from '@/lib/parser/availability';
import { previewIngest } from '@/lib/ingest';

export const runtime = 'nodejs';
const PARSE_CONCURRENCY = Number(process.env.UPLOAD_PARSE_CONCURRENCY) || 6;

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

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function previewFile(file: File): Promise<PreviewResult> {
  const fileName = file.name || 'statement.pdf';
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const hash = createHash('sha256').update(buf).digest('hex');
    const [existing] = await db
      .select({ status: documents.status })
      .from(documents)
      .where(eq(documents.contentHash, hash))
      .limit(1);
    if (existing?.status === 'parsed') return { fileName, status: 'duplicate-file' };

    const res = await runExtractor(buf, fileName);
    if (!res.ok) return { fileName, status: 'failed', error: res.error };
    if (res.type === 'paystub' && res.paystub) {
      return { fileName, status: 'paystub', account: res.account, statementPeriod: res.statementPeriod };
    }
    if (res.holdings && res.holdings.length > 0) {
      return {
        fileName,
        status: 'new',
        type: res.type,
        account: res.account,
        statementPeriod: res.statementPeriod,
        totalRows: res.holdings.length,
        newRows: res.holdings.length,
        duplicateRows: 0,
        reconciles: null,
      };
    }
    if (res.deferred || res.transactions.length === 0) {
      return {
        fileName,
        status: res.deferred ? 'deferred' : 'failed',
        type: res.type,
        account: res.account,
        error: res.deferred ? `${res.issuer} not supported yet` : 'No transactions found',
      };
    }

    const p = await previewIngest({
      rows: res.transactions,
      accountLabel: res.account ?? fileName,
      accountNumber: res.accountNumber,
      summary: res.summary ?? null,
    });
    return {
      fileName,
      status: 'new',
      type: res.type,
      account: p.accountName,
      accountExists: p.accountExists,
      statementPeriod: res.statementPeriod,
      totalRows: p.totalRows,
      newRows: p.newRows,
      duplicateRows: p.duplicateRows,
      reconciles: p.reconciles,
      endDelta: p.endDelta,
    };
  } catch (err) {
    return { fileName, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

export const POST = handler(async (req: NextRequest) => {
  if (!parserAvailable()) {
    return fail('parser_unavailable', PARSER_UNAVAILABLE_MESSAGE, 503);
  }

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail('no_files', 'No files uploaded.', 400);

  const results = await mapWithConcurrency(files, PARSE_CONCURRENCY, previewFile);
  const summary = {
    total: results.length,
    newRows: results.reduce((s, r) => s + (r.newRows ?? 0), 0),
    duplicateRows: results.reduce((s, r) => s + (r.duplicateRows ?? 0), 0),
    discrepancies: results.filter((r) => r.reconciles === false).length,
    duplicateFiles: results.filter((r) => r.status === 'duplicate-file').length,
  };
  return ok({ summary, results });
});
