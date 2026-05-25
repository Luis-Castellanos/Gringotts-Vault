/** Upload status summary + the non-parsed files. Read-only.
 *   npx tsx scripts/doc-status.ts */
import 'dotenv/config';
import { desc, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

async function main() {
  const all = await db
    .select({ fileName: documents.fileName, status: documents.status, issuer: documents.detectedIssuer })
    .from(documents)
    .orderBy(desc(documents.uploadedAt));
  const byStatus = new Map<string, number>();
  for (const d of all) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
  console.log('=== status counts ===');
  for (const [s, n] of byStatus) console.log(`  ${s}: ${n}`);
  console.log('\n=== not parsed ===');
  for (const d of all.filter((x) => x.status !== 'parsed')) {
    console.log(`  [${d.status}/${d.issuer}] ${d.fileName}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
