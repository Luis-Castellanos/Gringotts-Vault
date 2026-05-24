/**
 * Safe migration: convert accounts.type from the account_type enum to text and
 * add a FK to account_types(slug). Existing values (checking, savings, cash,
 * credit_card, other) are all seeded built-ins, so nothing is orphaned.
 * Idempotent. Run AFTER scripts/migrate-account-types.ts.
 *   npx tsx scripts/migrate-accounts-type-text.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

const STATEMENTS = [
  `ALTER TABLE accounts ALTER COLUMN type DROP DEFAULT;`,
  `ALTER TABLE accounts ALTER COLUMN type TYPE text USING type::text;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_type_account_types_fk') THEN
       ALTER TABLE accounts ADD CONSTRAINT accounts_type_account_types_fk
         FOREIGN KEY (type) REFERENCES account_types(slug);
     END IF;
   END $$;`,
];

async function main() {
  // Guard: every existing type must exist in account_types before the FK.
  const orphans = await db.execute(
    sql.raw(`SELECT DISTINCT a.type::text AS type FROM accounts a
             LEFT JOIN account_types t ON t.slug = a.type::text
             WHERE t.slug IS NULL;`),
  );
  const rows = (orphans as unknown as { rows: { type: string }[] }).rows;
  if (rows.length > 0) {
    console.error('  ! Orphan account types not in account_types:', rows.map((r) => r.type).join(', '));
    console.error('  Seed/repair those first (scripts/migrate-account-types.ts). Aborting.');
    process.exit(1);
  }

  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log('  ✓', stmt.split('\n')[0]!.trim());
  }
  console.log('Done. accounts.type is now text with a FK to account_types.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
