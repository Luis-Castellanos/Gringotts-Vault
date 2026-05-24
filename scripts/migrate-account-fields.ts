/**
 * Idempotent migration: adds the type-specific account columns. Safe to re-run.
 *   npx tsx scripts/migrate-account-fields.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const COLUMNS = [
  ['apy', 'numeric(6,3)'],
  ['interest_rate', 'numeric(6,3)'],
  ['monthly_payment', 'numeric(14,2)'],
  ['original_principal', 'numeric(14,2)'],
  ['maturity_date', 'date'],
  ['account_subtype', 'text'],
];

async function main() {
  for (const [name, type] of COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ${name} ${type};`));
    console.log(`  ✓ ${name} ${type}`);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
