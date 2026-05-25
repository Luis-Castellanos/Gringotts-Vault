/**
 * Read-only benchmark: serial vs. bounded-parallel parsing of stored statement
 * PDFs. Pulls a sample of already-ingested documents straight from
 * `documents.data` (bytea) and runs the parser adapter over them both ways —
 * no writes, no re-import. Measures the Phase 4a upload speedup.
 *
 *   npx tsx scripts/bench-parse.ts [sample=16] [concurrency=6]
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { runExtractor } from '@/lib/parser/extract';

const SAMPLE = Number(process.argv[2]) || 16;
const CONCURRENCY = Number(process.argv[3] || process.env.UPLOAD_PARSE_CONCURRENCY) || 6;

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

async function main() {
  const docs = await db
    .select({ fileName: documents.fileName, data: documents.data })
    .from(documents)
    .where(eq(documents.status, 'parsed'))
    .limit(SAMPLE);

  if (docs.length === 0) {
    console.log('No parsed documents stored — nothing to benchmark.');
    process.exit(0);
  }

  const files = docs.map((d) => ({ name: d.fileName, buf: Buffer.from(d.data as Buffer) }));
  console.log(`Benchmarking ${files.length} stored PDFs · concurrency=${CONCURRENCY}\n`);

  // Warm up once so Python interpreter/module cold-start doesn't skew the serial
  // run (which goes first). Not counted.
  await runExtractor(files[0]!.buf, files[0]!.name);

  // Serial
  let okSerial = 0;
  const t0 = performance.now();
  for (const f of files) {
    if ((await runExtractor(f.buf, f.name)).ok) okSerial++;
  }
  const serialMs = performance.now() - t0;

  // Parallel (bounded pool)
  const t1 = performance.now();
  const par = await mapWithConcurrency(files, CONCURRENCY, async (f) => (await runExtractor(f.buf, f.name)).ok);
  const parallelMs = performance.now() - t1;
  const okParallel = par.filter(Boolean).length;

  console.log(`Serial:   ${serialMs.toFixed(0).padStart(6)} ms   ${(serialMs / files.length).toFixed(0).padStart(4)} ms/file   ${okSerial}/${files.length} ok`);
  console.log(`Parallel: ${parallelMs.toFixed(0).padStart(6)} ms   ${(parallelMs / files.length).toFixed(0).padStart(4)} ms/file   ${okParallel}/${files.length} ok`);
  console.log(`\nSpeedup:  ${(serialMs / parallelMs).toFixed(2)}x`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
