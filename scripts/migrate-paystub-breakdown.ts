/**
 * Adds per-line breakdown columns to the paystubs table.
 *
 *   npx tsx scripts/migrate-paystub-breakdown.ts
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS). Each jsonb column holds [{label,amount}].
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

async function main() {
  await db.execute(sql`
    ALTER TABLE paystubs
      ADD COLUMN IF NOT EXISTS non_cash_fringe numeric(14,2),
      ADD COLUMN IF NOT EXISTS earnings jsonb,
      ADD COLUMN IF NOT EXISTS deductions jsonb,
      ADD COLUMN IF NOT EXISTS taxes jsonb,
      ADD COLUMN IF NOT EXISTS employer_contributions jsonb,
      ADD COLUMN IF NOT EXISTS imputed jsonb
  `);
  console.log('  ✓ paystubs breakdown columns');
  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
