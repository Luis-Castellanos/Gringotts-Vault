/**
 * One-shot: set institution = 'Goldman Sachs / Apple' on the existing
 * Apple Card 7999 row. This row predates preload-accounts.ts, which
 * intentionally does not update existing rows.
 *
 * Safe to re-run — no-op if institution is already set.
 *
 * Usage:
 *   tsx scripts/backfill-apple-card-institution.ts
 */

import 'dotenv/config';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';

async function main() {
  const result = await db
    .update(accounts)
    .set({ institution: 'Goldman Sachs / Apple', updatedAt: new Date() })
    .where(
      and(
        eq(accounts.name, 'Apple Card'),
        eq(accounts.accountNumber, '7999'),
        isNull(accounts.institution),
      ),
    )
    .returning({ id: accounts.id, name: accounts.name, institution: accounts.institution });

  if (result.length === 0) {
    console.log('No matching row needed update (Apple Card 7999 already has institution, or row not found).');
  } else {
    for (const r of result) {
      console.log(`  [~] Updated ${r.name}: institution = '${r.institution}'`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
