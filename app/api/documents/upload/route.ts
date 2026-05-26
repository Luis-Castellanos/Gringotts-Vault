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
 * bounded parallel pool. Phase 2 splits items by whether they call
 * getOrCreateAccount (a check-then-insert that can race): items that don't
 * (paystubs, failed parses, deferred-without-balance, duplicates) run in
 * parallel; statement/holdings/mortgage-snapshot items that do still run
 * serially. The vendor map (~4k rows) is loaded once for the whole batch.
 * Document INSERT uses onConflictDoNothing on content_hash so two byte-identical
 * files racing within the parallel pool resolve cleanly.
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents, imports } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { runExtractor, type ExtractResult } from '@/lib/parser/extract';
import { parserAvailable, PARSER_UNAVAILABLE_MESSAGE } from '@/lib/parser/availability';
import { ingestBalanceSnapshot, ingestHoldings, ingestParsedStatement, ingestPaystub, loadIngestMaps } from '@/lib/ingest';

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

// Items that don't call getOrCreateAccount are safe to ingest concurrently —
// the only shared write surface is documents.content_hash, which the DB unique
// index + onConflictDoNothing handle. The unsafe set is anything that resolves
// or creates an account: full statements, holdings, mortgage balance snapshots.
function isSafeForParallel(item: ParsedItem): boolean {
  if (item.kind !== 'parsed') return true;
  const r = item.extract;
  if (!r.ok) return true;
  if (r.type === 'paystub') return true;
  if (r.holdings && r.holdings.length > 0) return false;
  if (r.transactions.length > 0) return false;
  // Deferred path: chase_mortgage with a stated balance writes a balance_snapshot
  // (account-creating); everything else is just a status update.
  if (r.issuer === 'chase_mortgage' && r.summary?.ending_balance != null && r.summary.period_end) return false;
  return true;
}

// Insert the document row, racing safely against a concurrent insert of the
// same content_hash. Returns the documentId AND whether this caller created
// the row (false → another concurrent caller won, treat as duplicate).
async function ensureDocument(item: Extract<ParsedItem, { kind: 'parsed' }>): Promise<{ documentId: string; created: boolean }> {
  if (item.staleId) await db.delete(documents).where(eq(documents.id, item.staleId));
  const [doc] = await db
    .insert(documents)
    .values({
      fileName: item.fileName,
      contentHash: item.hash,
      mimeType: item.mimeType,
      byteSize: item.buf.byteLength,
      data: item.buf,
      status: 'parsing',
    })
    .onConflictDoNothing({ target: documents.contentHash })
    .returning({ id: documents.id });
  if (doc) return { documentId: doc.id, created: true };
  const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.contentHash, item.hash)).limit(1);
  return { documentId: existing!.id, created: false };
}

async function processItem(item: ParsedItem, maps: Awaited<ReturnType<typeof loadIngestMaps>>): Promise<FileResult> {
  if (item.kind === 'duplicate') {
    return { fileName: item.fileName, status: 'duplicate', documentId: item.documentId };
  }
  if (item.kind === 'error') {
    return { fileName: item.fileName, status: 'failed', error: item.error };
  }

  const { fileName, extract: res } = item;
  try {
    const { documentId, created } = await ensureDocument(item);
    // Lost the byte-identical race within this batch — another concurrent task
    // owns the document row; report this as a duplicate without re-ingesting.
    if (!created) return { fileName, status: 'duplicate', documentId };

    if (!res.ok) {
      await db
        .update(documents)
        .set({ status: 'failed', parseError: res.error, parsedAt: new Date() })
        .where(eq(documents.id, documentId));
      return { fileName, status: 'failed', error: res.error, documentId };
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
      return { fileName, status: 'parsed', type: 'paystub', account: res.account, statementPeriod: res.statementPeriod, documentId };
    }

    // Investment statements carry holdings (positions), not bank transactions.
    if (res.holdings && res.holdings.length > 0) {
      const asOf = res.holdings.find((h) => h.asOf)?.asOf ?? null;
      const [imp] = await db
        .insert(imports)
        .values({
          sourceFile: fileName,
          statementPeriod: res.statementPeriod,
          documentId,
          periodEnd: asOf,
        })
        .returning({ id: imports.id });
      const ing = await ingestHoldings({
        accountLabel: res.account ?? fileName,
        accountNumber: res.accountNumber,
        holdings: res.holdings,
        importId: imp?.id,
      });
      if (imp) await db.update(imports).set({ accountId: ing.accountId }).where(eq(imports.id, imp.id));
      await db
        .update(documents)
        .set({
          status: 'parsed',
          detectedType: res.type,
          detectedIssuer: res.issuer,
          accountIds: [ing.accountId],
          accountLabel: res.account,
          statementPeriod: res.statementPeriod,
          transactionCount: ing.inserted,
          parsedAt: new Date(),
        })
        .where(eq(documents.id, documentId));
      return {
        fileName,
        status: 'parsed',
        documentId,
        type: res.type,
        account: res.account,
        statementPeriod: res.statementPeriod,
        transactionCount: ing.inserted,
        inserted: ing.inserted,
        skipped: 0,
      };
    }

    // Investment/unknown issuers are recognized but not yet parsed, and a
    // recognized statement may legitimately yield no rows.
    if (res.deferred || res.transactions.length === 0) {
      const deferred = res.deferred;
      // A recognized loan statement contributes its stated balance (e.g. a
      // mortgage's unpaid principal) as a balance_snapshot — the authoritative
      // loan balance — without ledger transactions (the payment is captured on
      // the checking side). buildMortgage then prefers the latest snapshot.
      if (res.issuer === 'chase_mortgage' && res.summary?.ending_balance != null && res.summary.period_end) {
        try {
          await ingestBalanceSnapshot({
            accountLabel: res.account ?? fileName,
            accountNumber: res.accountNumber,
            asOf: res.summary.period_end,
            balance: res.summary.ending_balance,
          });
        } catch { /* snapshot is best-effort; don't fail the upload */ }
      }
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
      return {
        fileName,
        status: deferred ? 'deferred' : 'failed',
        type: res.type,
        account: res.account,
        error: deferred ? `${res.issuer} not supported yet` : 'No transactions found',
        documentId,
      };
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

    return {
      fileName,
      status: 'parsed',
      documentId,
      type: res.type,
      account: res.account,
      statementPeriod: res.statementPeriod,
      transactionCount: res.transactions.length,
      inserted: ingest.inserted,
      skipped: ingest.skipped,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { fileName, status: 'failed', error: msg };
  }
}

export const POST = handler(async (req: NextRequest) => {
  if (!parserAvailable()) {
    return fail('parser_unavailable', PARSER_UNAVAILABLE_MESSAGE, 503);
  }

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return fail('no_files', 'No files uploaded — send PDFs under the "files" field.', 400);
  }

  // Shared batch maps (vendor_rules is ~4k rows) — loaded once, not per file.
  const maps = await loadIngestMaps();

  // Phase 1 — parse all files in a bounded parallel pool.
  const parsed = await mapWithConcurrency(files, PARSE_CONCURRENCY, parseFile);

  // Phase 2 — split items by whether their ingest path touches accounts.
  // Safe items run concurrently; account-touching items run serially after so
  // getOrCreateAccount's check-then-insert can't race on the same account.
  const safeIdx: number[] = [];
  const serialIdx: number[] = [];
  parsed.forEach((item, i) => (isSafeForParallel(item) ? safeIdx : serialIdx).push(i));

  const results: FileResult[] = new Array(parsed.length);
  await mapWithConcurrency(safeIdx, PARSE_CONCURRENCY, async (i) => {
    results[i] = await processItem(parsed[i]!, maps);
  });
  for (const i of serialIdx) {
    results[i] = await processItem(parsed[i]!, maps);
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
