/**
 * DESTRUCTIVE. Wipes data so you can experiment from a clean slate.
 *
 *   npx tsx scripts/reset-data.ts                 # dry run (prints counts)
 *   npx tsx scripts/reset-data.ts --yes           # wipe transactions + imports + categories
 *   npx tsx scripts/reset-data.ts --yes --accounts# also wipe accounts + balance snapshots (full reset)
 *
 * npm aliases:
 *   npm run db:reset        # wipe data, KEEP accounts (re-run db:load-master to repopulate)
 *   npm run db:reset:all    # full clean slate, incl. accounts (then preload-accounts + load-master)
 *
 * The master.xlsx is the source of truth, so transactions/categories are
 * recoverable via db:load-master; accounts via preload-accounts.
 */

import 'dotenv/config';
import { isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, balanceSnapshots, categories, imports, transactions } from '@/lib/db/schema';

type Table = typeof transactions | typeof imports | typeof categories | typeof accounts | typeof balanceSnapshots;
async function count(table: Table) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row.n;
}

async function main() {
  const confirmed = process.argv.includes('--yes');
  const wipeAccounts = process.argv.includes('--accounts');

  console.log('Current state:');
  console.log(`  transactions: ${await count(transactions)}`);
  console.log(`  imports:      ${await count(imports)}`);
  console.log(`  categories:   ${await count(categories)}`);
  console.log(`  accounts:     ${await count(accounts)}${wipeAccounts ? '  → WILL be wiped' : '  (kept)'}`);

  if (!confirmed) {
    console.log(`\nDRY RUN — nothing deleted.`);
    console.log(`  Re-run with --yes to wipe data (keeps accounts).`);
    console.log(`  Add --accounts for a full clean slate.`);
    process.exit(0);
  }

  console.log('\nDeleting...');
  const dtx = await db.delete(transactions).returning({ id: transactions.id });
  console.log(`  transactions deleted: ${dtx.length}`);
  const dim = await db.delete(imports).returning({ id: imports.id });
  console.log(`  imports deleted:      ${dim.length}`);
  // Children reference parents (onDelete restrict), so delete children first.
  const dch = await db.delete(categories).where(isNotNull(categories.parentId)).returning({ id: categories.id });
  console.log(`  categories (children) deleted: ${dch.length}`);
  const dpar = await db.delete(categories).where(isNull(categories.parentId)).returning({ id: categories.id });
  console.log(`  categories (parents) deleted:  ${dpar.length}`);

  if (wipeAccounts) {
    const dsnap = await db.delete(balanceSnapshots).returning({ id: balanceSnapshots.id });
    console.log(`  balance snapshots deleted: ${dsnap.length}`);
    const dacc = await db.delete(accounts).returning({ id: accounts.id });
    console.log(`  accounts deleted:          ${dacc.length}`);
    console.log(`\nFull clean slate. Next: npm run db:seed (or preload-accounts) + db:load-master.`);
  } else {
    console.log(`\nData wiped (accounts kept). Next: npm run db:load-master "<path>".`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
