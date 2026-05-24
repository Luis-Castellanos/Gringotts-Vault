/**
 * Idempotent: creates the account_types table and seeds/updates the built-in
 * taxonomy from lib/account-types.ts. Safe to re-run (upserts built-ins;
 * user-added rows are left untouched). Does NOT modify accounts.type.
 *   npx tsx scripts/migrate-account-types.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { accountTypes } from '@/lib/db/schema';
import { ACCOUNT_TYPES } from '@/lib/account-types';

async function main() {
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS account_types (
       slug text PRIMARY KEY,
       label text NOT NULL,
       asset_class asset_class NOT NULL DEFAULT 'asset',
       "group" text NOT NULL DEFAULT 'other',
       sort_order integer NOT NULL DEFAULT 0,
       is_archived boolean NOT NULL DEFAULT false,
       is_builtin boolean NOT NULL DEFAULT false,
       created_at timestamptz NOT NULL DEFAULT now()
     );`),
  );
  console.log('  ✓ account_types table');

  let n = 0;
  for (const [i, t] of ACCOUNT_TYPES.entries()) {
    await db
      .insert(accountTypes)
      .values({ slug: t.slug, label: t.label, assetClass: t.assetClass, groupKey: t.group, sortOrder: i, isBuiltin: true })
      .onConflictDoUpdate({
        target: accountTypes.slug,
        // Keep built-ins in sync with the constant, but never resurrect an
        // archived one or clobber a user's reordering wildly — just core fields.
        set: { label: t.label, assetClass: t.assetClass, groupKey: t.group, isBuiltin: true },
      });
    n++;
  }
  console.log(`  ✓ seeded/updated ${n} built-in types`);
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
