/**
 * Upload one or more statement PDFs.
 *
 *   POST /api/documents/upload   (multipart/form-data, field "files")
 *
 * Per file: store the PDF (bytea) + a documents row, run the parser adapter,
 * ingest the extracted rows (Uncategorized + needs_review), and record the
 * outcome on the documents row. Dedups identical re-uploads by content hash.
 * One bad file never aborts the batch.
 */

import { NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { runExtractor } from '@/lib/parser/extract';
import { ingestParsedStatement } from '@/lib/ingest';

export const runtime = 'nodejs';

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

export const POST = handler(async (req: NextRequest) => {
  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return fail('no_files', 'No files uploaded — send PDFs under the "files" field.', 400);
  }

  const results: FileResult[] = [];

  for (const file of files) {
    const fileName = file.name || 'statement.pdf';
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const hash = createHash('sha256').update(buf).digest('hex');

      // Dedup: identical bytes already uploaded. A previously *parsed* file is a
      // real duplicate → skip. A previously failed/deferred/stuck one gets a
      // retry (those created no transactions), so drop the stale row and reparse.
      const [existing] = await db
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(eq(documents.contentHash, hash))
        .limit(1);
      if (existing) {
        if (existing.status === 'parsed') {
          results.push({ fileName, status: 'duplicate', documentId: existing.id });
          continue;
        }
        await db.delete(documents).where(eq(documents.id, existing.id));
      }

      // Store the file first so it's retained even if parsing fails.
      const [doc] = await db
        .insert(documents)
        .values({
          fileName,
          contentHash: hash,
          mimeType: file.type || 'application/pdf',
          byteSize: buf.byteLength,
          data: buf,
          status: 'parsing',
        })
        .returning({ id: documents.id });
      const documentId = doc!.id;

      const res = await runExtractor(buf, fileName);

      if (!res.ok) {
        await db
          .update(documents)
          .set({ status: 'failed', parseError: res.error, parsedAt: new Date() })
          .where(eq(documents.id, documentId));
        results.push({ fileName, status: 'failed', error: res.error, documentId });
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
