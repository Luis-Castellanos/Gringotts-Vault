/**
 * Re-parse every stored paystub PDF through the current parser and replace the
 * paystubs rows. Use after a parser fix so existing rows pick up corrected
 * totals + line-item breakdowns without re-uploading.
 *   npx tsx scripts/reprocess-paystubs.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@/lib/db/client';
import { documents, paystubs } from '@/lib/db/schema';
import { ingestPaystub, type ParsedPaystub } from '@/lib/ingest';

async function main() {
  const docs = await db.select({ id: documents.id, fileName: documents.fileName, data: documents.data })
    .from(documents).where(eq(documents.detectedType, 'paystub'));
  console.log('paystub documents:', docs.length);
  await db.delete(paystubs);
  const dir = mkdtempSync(join(tmpdir(), 'vault-ps-'));
  let ok = 0;
  for (const d of docs) {
    const pdf = join(dir, `${d.id}.pdf`);
    writeFileSync(pdf, d.data as Buffer);
    const out = execFileSync('python', ['parser/extract.py', pdf, d.fileName], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const res = JSON.parse(out);
    if (res.ok && res.paystub) { await ingestPaystub(d.id, res.paystub as ParsedPaystub, d.fileName); ok++; }
    else console.log('  skip', d.fileName, res.error ?? '(no paystub)');
  }
  console.log('re-ingested:', ok);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
