/**
 * Seeds / restores the canonical category taxonomy.
 *
 * The source of truth is scripts/data/categories.json — a snapshot of the
 * taxonomy (flow → parent → child, with colors, flow types, sort order). It is
 * regenerated from the live DB with scripts/_dump-cats.ts whenever the taxonomy
 * changes intentionally, so this seed is the durable default the database is
 * restored to (e.g. after a clean-slate reset for a dry run).
 *
 *   npx tsx scripts/seed-categories.ts            # upsert (insert missing, sync existing)
 *   npx tsx scripts/seed-categories.ts --insert   # insert missing only (don't touch existing)
 *
 * Idempotent: two passes (parents, then children) keyed on slug.
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';

type FlowType = 'inflow' | 'outflow' | 'transfer';
type Seed = {
  slug: string;
  name: string;
  parentSlug: string | null;
  color: string | null;
  flowType: FlowType;
  isIncome: boolean;
  sortOrder: number;
  isArchived: boolean;
};

const SEEDS: Seed[] = JSON.parse(
  readFileSync(resolve(__dirname, 'data/categories.json'), 'utf8'),
);

async function seed() {
  const syncExisting = !process.argv.includes('--insert');
  console.log(`Seeding ${SEEDS.length} categories from data/categories.json (${syncExisting ? 'upsert' : 'insert-only'})...`);

  const idsBySlug = new Map<string, string>();
  let inserted = 0;
  let updated = 0;

  // Pass 1: parents (no parentSlug). Pass 2: children (resolve parentId by slug).
  for (const pass of [false, true]) {
    for (const s of SEEDS.filter((x) => Boolean(x.parentSlug) === pass)) {
      const parentId = s.parentSlug ? idsBySlug.get(s.parentSlug) ?? null : null;
      if (s.parentSlug && !parentId) {
        console.warn(`  ! parent ${s.parentSlug} not found for ${s.slug}, skipping`);
        continue;
      }

      const existing = await db.select().from(categories).where(eq(categories.slug, s.slug));
      const fields = {
        name: s.name,
        color: s.color,
        flowType: s.flowType,
        isIncome: s.isIncome,
        sortOrder: s.sortOrder,
        isArchived: s.isArchived,
        parentId,
      };

      if (existing[0]) {
        idsBySlug.set(s.slug, existing[0].id);
        if (syncExisting) {
          await db.update(categories).set(fields).where(eq(categories.id, existing[0].id));
          updated++;
        }
        continue;
      }

      const [row] = await db
        .insert(categories)
        .values({ slug: s.slug, ...fields })
        .returning({ id: categories.id });
      idsBySlug.set(s.slug, row.id);
      inserted++;
    }
  }

  console.log(`Done. ${inserted} inserted, ${updated} synced.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
