/**
 * Idempotent migration: creates the vendor_rules table (normalized merchant →
 * category) used for deterministic categorization at ingest. Safe to re-run.
 *   npx tsx scripts/migrate-vendor-rules.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS vendor_rules (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     merchant text NOT NULL,
     category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
     source text NOT NULL DEFAULT 'manual',
     hit_count integer NOT NULL DEFAULT 0,
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now()
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS vendor_rules_merchant_unique ON vendor_rules (merchant);`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log('  ✓', stmt.split('\n')[0]!.trim());
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
