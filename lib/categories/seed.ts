/**
 * Restore the canonical category taxonomy (Settings → "Restore default
 * categories"). Source of truth is scripts/data/categories.json (the same
 * snapshot the seed script uses). Upserts every default category (re-adds any
 * deleted/edited defaults, syncs names/colors/flow/order), then removes any
 * custom (non-seed) categories — transactions in a removed category fall back to
 * Uncategorized (categoryId is ON DELETE SET NULL).
 */

import { eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import seedsRaw from '../../scripts/data/categories.json';

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

const SEEDS = seedsRaw as Seed[];

export async function restoreCategoryTaxonomy(): Promise<{ inserted: number; synced: number; removedCustom: number }> {
  const idsBySlug = new Map<string, string>();
  let inserted = 0;
  let synced = 0;

  // Pass 1: parents, Pass 2: children (resolve parentId by slug).
  for (const pass of [false, true]) {
    for (const s of SEEDS.filter((x) => Boolean(x.parentSlug) === pass)) {
      const parentId = s.parentSlug ? idsBySlug.get(s.parentSlug) ?? null : null;
      if (s.parentSlug && !parentId) continue;
      const fields = {
        name: s.name,
        color: s.color,
        flowType: s.flowType,
        isIncome: s.isIncome,
        sortOrder: s.sortOrder,
        isArchived: s.isArchived,
        parentId,
      };
      const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, s.slug));
      if (existing) {
        idsBySlug.set(s.slug, existing.id);
        await db.update(categories).set(fields).where(eq(categories.id, existing.id));
        synced++;
      } else {
        const [row] = await db.insert(categories).values({ slug: s.slug, ...fields }).returning({ id: categories.id });
        idsBySlug.set(s.slug, row!.id);
        inserted++;
      }
    }
  }

  // Remove custom (non-seed) categories. parent_id is ON DELETE RESTRICT, so
  // first null out any reference TO a category we're about to delete.
  const seedSlugs = SEEDS.map((s) => s.slug);
  const customs = await db.select({ id: categories.id }).from(categories).where(notInArray(categories.slug, seedSlugs));
  let removedCustom = 0;
  if (customs.length) {
    const ids = customs.map((c) => c.id);
    await db.update(categories).set({ parentId: null }).where(inArray(categories.parentId, ids));
    const deleted = await db.delete(categories).where(inArray(categories.id, ids)).returning({ id: categories.id });
    removedCustom = deleted.length;
  }

  return { inserted, synced, removedCustom };
}
