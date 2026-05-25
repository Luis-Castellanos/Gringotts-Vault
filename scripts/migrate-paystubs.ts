/**
 * Idempotent migration: creates the paystubs table. Safe to re-run.
 *   npx tsx scripts/migrate-paystubs.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS paystubs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
     pay_date date,
     pay_period text,
     voucher text,
     employer text,
     base_comp numeric(14,2),
     gross numeric(14,2),
     net numeric(14,2),
     deductions_total numeric(14,2),
     taxes_total numeric(14,2),
     employer_total numeric(14,2),
     hours numeric(8,2),
     deposits jsonb,
     source_file text,
     created_at timestamptz NOT NULL DEFAULT now()
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS paystubs_voucher_unique ON paystubs (voucher);`,
  `CREATE INDEX IF NOT EXISTS paystubs_pay_date_idx ON paystubs (pay_date);`,
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
