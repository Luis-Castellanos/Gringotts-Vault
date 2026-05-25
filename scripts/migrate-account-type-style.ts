/**
 * Idempotent: adds icon/color to account_types, creates account_type_groups,
 * and seeds both from lib/account-types.ts (icons per type, colors per group).
 * Built-in icons/colors are filled only where still null so user edits stick.
 *   npx tsx scripts/migrate-account-type-style.ts
 */

import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { accountTypes, accountTypeGroups } from '@/lib/db/schema';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_GROUPS } from '@/lib/account-types';

async function main() {
  await db.execute(sql.raw(`ALTER TABLE account_types ADD COLUMN IF NOT EXISTS icon text;`));
  await db.execute(sql.raw(`ALTER TABLE account_types ADD COLUMN IF NOT EXISTS color text;`));
  await db.execute(
    sql.raw(`CREATE TABLE IF NOT EXISTS account_type_groups (
       key text PRIMARY KEY,
       label text NOT NULL,
       color text NOT NULL DEFAULT '#94a3b8',
       icon text,
       sort_order integer NOT NULL DEFAULT 0
     );`),
  );
  console.log('  ✓ account_types.icon/color + account_type_groups');

  // Seed groups (upsert label/color/order for built-ins).
  for (const [i, g] of ACCOUNT_TYPE_GROUPS.entries()) {
    await db
      .insert(accountTypeGroups)
      .values({ key: g.key, label: g.label, color: g.color, sortOrder: i })
      .onConflictDoUpdate({ target: accountTypeGroups.key, set: { label: g.label } });
  }
  console.log(`  ✓ seeded ${ACCOUNT_TYPE_GROUPS.length} groups`);

  // Backfill type icons only where null (don't clobber user edits).
  let n = 0;
  for (const t of ACCOUNT_TYPES) {
    await db
      .update(accountTypes)
      .set({ icon: t.icon })
      .where(sql`${accountTypes.slug} = ${t.slug} AND ${accountTypes.icon} IS NULL`);
    n++;
  }
  console.log(`  ✓ backfilled icons for up to ${n} built-in types`);
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
