/**
 * Clears INGESTED data for a clean pipeline test, while preserving the things
 * that are either curated or required for ingest:
 *   - wipes: transactions, imports, documents (uploaded PDFs)
 *   - keeps: accounts (+ their curated fields) and categories (taxonomy)
 *
 *   npx tsx scripts/clear-ingested.ts            # dry run (counts only)
 *   npx tsx scripts/clear-ingested.ts --yes      # wipe
 *
 * Everything wiped is recoverable: re-upload statements (or db:load-master).
 * To also wipe accounts, use scripts/reset-data.ts --accounts.
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents, imports, transactions } from '@/lib/db/schema';

async function count(table: typeof transactions | typeof imports | typeof documents) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row!.n;
}

async function main() {
  const confirmed = process.argv.includes('--yes');

  console.log('Current state:');
  console.log(`  transactions: ${await count(transactions)}`);
  console.log(`  imports:      ${await count(imports)}`);
  console.log(`  documents:    ${await count(documents)}`);
  console.log('  accounts + categories: kept');

  if (!confirmed) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --yes to wipe.');
    process.exit(0);
  }

  console.log('\nDeleting...');
  const dtx = await db.delete(transactions).returning({ id: transactions.id });
  console.log(`  transactions deleted: ${dtx.length}`);
  const dim = await db.delete(imports).returning({ id: imports.id });
  console.log(`  imports deleted:      ${dim.length}`);
  const ddoc = await db.delete(documents).returning({ id: documents.id });
  console.log(`  documents deleted:    ${ddoc.length}`);
  console.log('\nIngested data cleared. Accounts + taxonomy kept. Upload a statement to test.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
