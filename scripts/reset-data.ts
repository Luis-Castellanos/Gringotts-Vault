/**
 * DESTRUCTIVE. Clears ingested data for a clean dry run.
 *
 *   npx tsx scripts/reset-data.ts                  # dry run (prints counts only)
 *   npx tsx scripts/reset-data.ts --yes            # wipe transactions/imports/documents/paystubs (KEEP accounts)
 *   npx tsx scripts/reset-data.ts --yes --accounts # also wipe accounts + balance snapshots (full clean slate)
 *
 * npm aliases:
 *   npm run db:reset        # wipe ingested data, KEEP accounts
 *   npm run db:reset:all    # full clean slate, incl. accounts
 *
 * ALWAYS KEPT (the canonical defaults): categories, account_types,
 * account_type_groups, vendor_rules, app_settings. Restore categories from the
 * versioned snapshot with `npm run db:seed` if you ever need to.
 *
 * Deletion order respects FKs: transactions reference accounts with onDelete
 * 'restrict', so they go first; balance snapshots cascade off accounts.
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import {
  accounts,
  balanceSnapshots,
  documents,
  imports,
  paystubs,
  transactions,
} from '@/lib/db/schema';

async function count(table: PgTable) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return row.n;
}

async function wipe(label: string, table: PgTable) {
  const deleted = await db.delete(table).returning({ one: sql<number>`1` });
  console.log(`  ${label.padEnd(18)} deleted: ${deleted.length}`);
}

async function main() {
  const confirmed = process.argv.includes('--yes');
  const wipeAccounts = process.argv.includes('--accounts');

  console.log('Current state:');
  console.log(`  transactions:      ${await count(transactions)}`);
  console.log(`  imports:           ${await count(imports)}`);
  console.log(`  documents:         ${await count(documents)}`);
  console.log(`  paystubs:          ${await count(paystubs)}`);
  console.log(`  balance snapshots: ${await count(balanceSnapshots)}`);
  console.log(`  accounts:          ${await count(accounts)}${wipeAccounts ? '  → WILL be wiped' : '  (kept)'}`);
  console.log('  categories / account_types / vendor_rules / settings: kept');

  if (!confirmed) {
    console.log('\nDRY RUN — nothing deleted.');
    console.log('  Re-run with --yes to wipe ingested data (keeps accounts).');
    console.log('  Add --accounts for a full clean slate.');
    process.exit(0);
  }

  console.log('\nDeleting...');
  // transactions first (restrict FK on accounts), then the rest.
  await wipe('transactions', transactions);
  await wipe('paystubs', paystubs);
  await wipe('imports', imports);
  await wipe('documents', documents);

  if (wipeAccounts) {
    await wipe('balance snapshots', balanceSnapshots);
    await wipe('accounts', accounts);
    console.log('\nFull clean slate. Taxonomies kept. Upload a statement to start fresh.');
  } else {
    console.log('\nIngested data wiped (accounts kept). Upload a statement to repopulate.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
