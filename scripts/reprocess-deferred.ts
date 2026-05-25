/**
 * Re-parse stored documents that previously deferred/failed (e.g. after a parser
 * fix). Re-runs the extractor on the saved PDF bytes and ingests if it now
 * parses. Idempotent: transactions dedupe by content hash; only touches docs
 * currently in deferred/failed status.
 *   npx tsx scripts/reprocess-deferred.ts             # all deferred + failed
 *   npx tsx scripts/reprocess-deferred.ts "0211 2025"  # filename substring
 */
import 'dotenv/config';
import { and, eq, ilike, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { runExtractor } from '@/lib/parser/extract';
import { ingestParsedStatement, ingestPaystub } from '@/lib/ingest';

async function main() {
  const q = process.argv[2];
  const where = q
    ? and(inArray(documents.status, ['deferred', 'failed']), ilike(documents.fileName, `%${q}%`))
    : inArray(documents.status, ['deferred', 'failed']);
  const rows = await db
    .select({ id: documents.id, fileName: documents.fileName, status: documents.status, data: documents.data })
    .from(documents)
    .where(where);

  if (rows.length === 0) { console.log('No deferred/failed documents match.'); process.exit(0); }
  console.log(`Reprocessing ${rows.length} document(s)…`);

  for (const d of rows) {
    const res = await runExtractor(d.data as Buffer, d.fileName);
    if (!res.ok) { console.log(`  ✗ ${d.fileName}: ${res.error}`); continue; }

    if (res.type === 'paystub' && res.paystub) {
      await ingestPaystub(d.id, res.paystub, d.fileName);
      await db.update(documents).set({
        status: 'parsed', detectedType: 'paystub', detectedIssuer: 'paystub',
        accountLabel: res.account, statementPeriod: res.statementPeriod,
        transactionCount: 0, parsedAt: new Date(), parseError: null,
      }).where(eq(documents.id, d.id));
      console.log(`  ✓ ${d.fileName}: paystub`);
      continue;
    }

    if (res.deferred || res.transactions.length === 0) {
      console.log(`  · ${d.fileName}: still ${res.deferred ? `deferred (${res.issuer})` : 'no transactions'}`);
      continue;
    }

    const ing = await ingestParsedStatement({
      rows: res.transactions,
      accountLabel: res.account ?? d.fileName,
      accountNumber: res.accountNumber,
      sourceFile: d.fileName,
      statementPeriod: res.statementPeriod,
      summary: res.summary ?? null,
      documentId: d.id,
    });
    await db.update(documents).set({
      status: 'parsed', detectedType: res.type, detectedIssuer: res.issuer,
      accountIds: [ing.accountId], accountLabel: res.account, statementPeriod: res.statementPeriod,
      transactionCount: res.transactions.length, parsedAt: new Date(), parseError: null,
    }).where(eq(documents.id, d.id));
    console.log(`  ✓ ${d.fileName}: ${res.issuer} — ${ing.inserted} inserted, ${ing.skipped} skipped`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
