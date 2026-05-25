/**
 * Upload one or more statement PDFs.
 *
 *   POST /api/documents/upload   (multipart/form-data, field "files")
 *
 * Per file: store the PDF (bytea) + a documents row, run the parser adapter,
 * ingest the extracted rows (Uncategorized + needs_review), and record the
 * outcome on the documents row. Dedups identical re-uploads by content hash.
 * One bad file never aborts the batch.
 *
 * Two-phase for speed (Phase 4a): parsing — the per-file Python + pdftotext
 * spawn — is the bottleneck and is independent per file, so it runs in a
 * bounded parallel pool. All ledger writes then run in a serial second pass, so
 * account resolution (getOrCreateAccount is check-then-insert) and the
 * documents content-hash dedup can't race. The vendor map (~4k rows) is loaded
 * once for the whole batch instead of once per file.
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { runExtractor, type ExtractResult } from '@/lib/parser/extract';
import { ingestParsedStatement, ingestPaystub, loadIngestMaps } from '@/lib/ingest';

export const runtime = 'nodejs';

// Parser spawns to run at once. Tuned for typical core counts; override per host.
const PARSE_CONCURRENCY = Number(process.env.UPLOAD_PARSE_CONCURRENCY) || 6;

type FileResult = {
  fileName: string;
  status: 'parsed' | 'failed' | 'deferred' | 'duplicate';
  documentId?: string;
  type?: string;
  account?: string | null;
  statementPeriod?: string | null;
  transactionCount?: number;
  inserted?: number;
  skipped?: number;
  error?: string;
};

// Output of the parallel parse phase, consumed by the serial ingest phase.
type ParsedItem =
  | { kind: 'duplicate'; fileName: string; documentId: string }
  | { kind: 'error'; fileName: string; error: string }
  | {
      kind: 'parsed';
      fileName: string;
      buf: Buffer;
      hash: string;
      mimeType: string;
      staleId?: string; // a prior failed/deferred row to drop + retry
      extract: ExtractResult;
    };

/** Run `fn` over `items` with at most `limit` in flight; preserves input order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
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

// Phase 1 (parallel): read bytes, hash, dedup-check, and parse. No ledger writes
// here — the only DB touch is a read-only dedup lookup, so nothing races.
async function parseFile(file: File): Promise<ParsedItem> {
  const fileName = file.name || 'statement.pdf';
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const hash = createHash('sha256').update(buf).digest('hex');

    // Dedup: identical bytes already uploaded. A previously *parsed* file is a
    // real duplicate → skip. A previously failed/deferred/stuck one gets a retry
    // (those created no transactions), so drop the stale row and reparse.
    const [existing] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(eq(documents.contentHash, hash))
      .limit(1);
    if (existing?.status === 'parsed') {
      return { kind: 'duplicate', fileName, documentId: existing.id };
    }

    const extract = await runExtractor(buf, fileName);
    return {
      kind: 'parsed',
      fileName,
      buf,
      hash,
      mimeType: file.type || 'application/pdf',
      staleId: existing?.id,
      extract,
    };
  } catch (err) {
    return { kind: 'error', fileName, error: err instanceof Error ? err.message : String(err) };
  }
}

export const POST = handler(async (req: NextRequest) => {
  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return fail('no_files', 'No files uploaded — send PDFs under the "files" field.', 400);
  }

  // Shared batch maps (vendor_rules is ~4k rows) — loaded once, not per file.
  const maps = await loadIngestMaps();

  // Phase 1 — parse all files in a bounded parallel pool.
  const parsed = await mapWithConcurrency(files, PARSE_CONCURRENCY, parseFile);

  // Phase 2 — ingest serially so account creation + dedup can't race.
  const results: FileResult[] = [];
  const seenInBatch = new Map<string, string>(); // content hash → first documentId
  for (const item of parsed) {
    if (item.kind === 'duplicate') {
      results.push({ fileName: item.fileName, status: 'duplicate', documentId: item.documentId });
      continue;
    }
    if (item.kind === 'error') {
      results.push({ fileName: item.fileName, status: 'failed', error: item.error });
      continue;
    }

    const { fileName, buf, hash, mimeType, staleId, extract: res } = item;

    // Two byte-identical files in the same batch both clear the Phase 1 dedup
    // check (neither was stored yet); the first one to land here wins.
    const already = seenInBatch.get(hash);
    if (already) {
      results.push({ fileName, status: 'duplicate', documentId: already });
      continue;
    }

    try {
      if (staleId) await db.delete(documents).where(eq(documents.id, staleId));

      // Store the file first so it's retained even if parsing failed.
      const [doc] = await db
        .insert(documents)
        .values({
          fileName,
          contentHash: hash,
          mimeType,
          byteSize: buf.byteLength,
          data: buf,
          status: 'parsing',
        })
        .returning({ id: documents.id });
      const documentId = doc!.id;
      seenInBatch.set(hash, documentId);

      if (!res.ok) {
        await db
          .update(documents)
          .set({ status: 'failed', parseError: res.error, parsedAt: new Date() })
          .where(eq(documents.id, documentId));
        results.push({ fileName, status: 'failed', error: res.error, documentId });
        continue;
      }

      // Paystubs are a different shape (not bank transactions) → their own table.
      if (res.type === 'paystub' && res.paystub) {
        await ingestPaystub(documentId, res.paystub, fileName);
        await db
          .update(documents)
          .set({
            status: 'parsed',
            detectedType: 'paystub',
            detectedIssuer: 'paystub',
            accountLabel: res.account,
            statementPeriod: res.statementPeriod,
            transactionCount: 0,
            parsedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
        results.push({ fileName, status: 'parsed', type: 'paystub', account: res.account, statementPeriod: res.statementPeriod, documentId });
        continue;
      }

      // Investment/unknown issuers are recognized but not yet parsed, and a
      // recognized statement may legitimately yield no rows.
      if (res.deferred || res.transactions.length === 0) {
        const deferred = res.deferred;
        await db
          .update(documents)
          .set({
            status: deferred ? 'deferred' : 'failed',
            detectedType: res.type,
            detectedIssuer: res.issuer,
            accountLabel: res.account,
            statementPeriod: res.statementPeriod,
            parseError: deferred
              ? `${res.issuer} statements aren't parsed yet.`
              : 'No transactions found in this statement.',
            parsedAt: new Date(),
          })
          .where(eq(documents.id, documentId));
        results.push({
          fileName,
          status: deferred ? 'deferred' : 'failed',
          type: res.type,
          account: res.account,
          error: deferred ? `${res.issuer} not supported yet` : 'No transactions found',
          documentId,
        });
        continue;
      }

      const ingest = await ingestParsedStatement({
        rows: res.transactions,
        accountLabel: res.account ?? fileName,
        accountNumber: res.accountNumber,
        sourceFile: fileName,
        statementPeriod: res.statementPeriod,
        summary: res.summary ?? null,
        documentId,
        maps,
      });

      await db
        .update(documents)
        .set({
          status: 'parsed',
          detectedType: res.type,
          detectedIssuer: res.issuer,
          accountIds: [ingest.accountId],
          accountLabel: res.account,
          statementPeriod: res.statementPeriod,
          transactionCount: res.transactions.length,
          parsedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      results.push({
        fileName,
        status: 'parsed',
        documentId,
        type: res.type,
        account: res.account,
        statementPeriod: res.statementPeriod,
        transactionCount: res.transactions.length,
        inserted: ingest.inserted,
        skipped: ingest.skipped,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ fileName, status: 'failed', error: msg });
    }
  }

  const summary = {
    total: results.length,
    parsed: results.filter((r) => r.status === 'parsed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    deferred: results.filter((r) => r.status === 'deferred').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
  };
  return ok({ summary, results });
});
