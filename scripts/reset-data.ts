/**
 * DESTRUCTIVE. Wipes all transactions, imports, and categories so the loader can
 * rebuild the taxonomy + re-import from a clean slate. Accounts are kept.
 *
 * Dry run (just prints current counts):
 *   npx tsx scripts/reset-data.ts
 * Execute:
 *   npx tsx scripts/reset-data.ts --yes
 *
 * Intended for the one-time switch to the new master.xlsx schema, where old data
 * had wrong signs / categories. The master file is the source of truth, so this
 * is recoverable by re-running db:load-master.
 */

import 'dotenv/config';
import { isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, imports, transactions } from '@/lib/db/schema';

async function count(table: typeof transactions | typeof imports | typeof categories) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row.n;
}

async function main() {
  const confirmed = process.argv.includes('--yes');

  console.log(`Current state:`);
  console.log(`  transactions: ${await count(transactions)}`);
  console.log(`  imports:      ${await count(imports)}`);
  console.log(`  categories:   ${await count(categories)}`);
  console.log(`  (accounts are NOT touched)`);

  if (!confirmed) {
    console.log(`\nDRY RUN — nothing deleted. Re-run with --yes to execute.`);
    process.exit(0);
  }

  console.log(`\nDeleting...`);
  const dtx = await db.delete(transactions).returning({ id: transactions.id });
  console.log(`  transactions deleted: ${dtx.length}`);
  const dim = await db.delete(imports).returning({ id: imports.id });
  console.log(`  imports deleted:      ${dim.length}`);
  // Children reference parents (onDelete restrict), so delete children first.
  const dch = await db.delete(categories).where(isNotNull(categories.parentId)).returning({ id: categories.id });
  console.log(`  categories (children) deleted: ${dch.length}`);
  const dpar = await db.delete(categories).where(isNull(categories.parentId)).returning({ id: categories.id });
  console.log(`  categories (parents) deleted:  ${dpar.length}`);

  console.log(`\nDone. Now run: npm run db:load-master "<path-to-master.xlsx>"`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
