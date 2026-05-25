/**
 * Idempotent migration: adds statement-audit fields — stated control totals on
 * `imports` and the per-row running balance on `transactions`. Safe to re-run.
 *   npx tsx scripts/migrate-audit-fields.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const COLUMNS: [table: string, name: string, type: string][] = [
  ['imports', 'period_start', 'date'],
  ['imports', 'period_end', 'date'],
  ['imports', 'beginning_balance', 'numeric(14,2)'],
  ['imports', 'ending_balance', 'numeric(14,2)'],
  ['imports', 'stated_credits', 'numeric(14,2)'],
  ['imports', 'stated_debits', 'numeric(14,2)'],
  ['transactions', 'balance', 'numeric(14,2)'],
];

async function main() {
  for (const [table, name, type] of COLUMNS) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${type};`));
    console.log(`  ✓ ${table}.${name} ${type}`);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
