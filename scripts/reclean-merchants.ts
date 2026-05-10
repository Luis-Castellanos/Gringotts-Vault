/**
 * Recomputes the `merchant` column for every transaction by re-running
 * cleanMerchant() against the stored raw_description. Only updates rows
 * whose merchant value actually changes.
 *
 * Usage:
 *   npx tsx scripts/reclean-merchants.ts
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';

async function main() {
  const rows = await db
    .select({ id: transactions.id, raw: transactions.rawDescription, merchant: transactions.merchant })
    .from(transactions);

  console.log(`Scanning ${rows.length} transactions...`);

  let updated = 0;
  let unchanged = 0;
  const samples: Array<{ before: string | null; after: string }> = [];

  for (const r of rows) {
    const next = cleanMerchant(r.raw);
    if (next === r.merchant) {
      unchanged++;
      continue;
    }
    await db.update(transactions).set({ merchant: next }).where(eq(transactions.id, r.id));
    if (samples.length < 10) samples.push({ before: r.merchant, after: next });
    updated++;
  }

  console.log(`\nDone. Updated ${updated}, unchanged ${unchanged}.`);
  if (samples.length > 0) {
    console.log('\nSample changes:');
    for (const s of samples) console.log(`  ${JSON.stringify(s.before)}  →  ${JSON.stringify(s.after)}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
