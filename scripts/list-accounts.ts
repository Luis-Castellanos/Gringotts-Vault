/**
 * Prints all accounts currently in the database, grouped by asset class.
 *
 * Usage:
 *   tsx scripts/list-accounts.ts
 */

import 'dotenv/config';
import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';

async function main() {
  const rows = await db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.assetClass), asc(accounts.type), asc(accounts.name));

  if (rows.length === 0) {
    console.log('(no accounts in database)');
    process.exit(0);
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    pad('NAME', 28) + pad('LAST 4', 8) + pad('TYPE', 14) + pad('CLASS', 12) + pad('ACTIVE', 8) + 'INSTITUTION',
  );
  console.log('-'.repeat(90));
  for (const a of rows) {
    console.log(
      pad(a.name, 28) +
        pad(a.accountNumber ?? '—', 8) +
        pad(a.type, 14) +
        pad(a.assetClass, 12) +
        pad(a.isActive ? 'yes' : 'no', 8) +
        (a.institution ?? '—'),
    );
  }
  console.log(`\nTotal: ${rows.length} account(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
