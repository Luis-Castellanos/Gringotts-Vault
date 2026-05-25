/** Dump a stored document's pdftotext -layout output to reference/_dump.txt for
 * inspection. Read-only. Usage: npx tsx scripts/dump-doc-text.ts "0309 2023" */
import 'dotenv/config';
import { ilike } from 'drizzle-orm';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

async function main() {
  const q = process.argv[2] ?? '';
  const [d] = await db
    .select({ fileName: documents.fileName, data: documents.data })
    .from(documents)
    .where(ilike(documents.fileName, `%${q}%`))
    .limit(1);
  if (!d) { console.log('no match'); process.exit(0); }
  const dir = await mkdtemp(join(tmpdir(), 'vault-dump-'));
  const pdf = join(dir, 'doc.pdf');
  await writeFile(pdf, d.data as Buffer);
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-layout', pdf, '-'], { encoding: 'utf-8' });
  const out = join(process.cwd(), 'reference', '_dump.txt');
  await writeFile(out, r.stdout ?? '', 'utf-8');
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  console.log(`Wrote ${(r.stdout ?? '').length} chars of "${d.fileName}" → reference/_dump.txt`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
