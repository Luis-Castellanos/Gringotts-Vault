/**
 * Recomputes the `merchant` column for every transaction by re-running
 * cleanMerchant() against the stored raw_description. Only updates rows
 * whose merchant value actually changes.
 *
 * Usage:
 *   npx tsx scripts/reclean-merchants.ts
 */

import 'dotenv/config';

import { recleanMerchants } from '@/lib/transactions/reclean';

async function main() {
  const { scanned, updated, samples } = await recleanMerchants();
  console.log(`Scanned ${scanned}. Updated ${updated}, unchanged ${scanned - updated}.`);
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
