/**
 * Idempotent migration: adds the manual-entry credit-card metadata columns
 * (signup bonus + benefits) to accounts. Safe to re-run.
 *   npx tsx scripts/migrate-cc-fields.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const COLUMNS = [
  ['signup_bonus', 'jsonb'],
  ['benefits', 'jsonb'],
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
