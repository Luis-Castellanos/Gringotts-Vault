/**
 * Splits the single "Transfers" category into "Transfers In" and "Transfers Out"
 * (Type stays Transfers). Each new category gets the SAME sub-categories the old
 * Transfers category had. Existing transfer transactions are re-pointed to the
 * In or Out leg by sign (inflow → In, outflow → Out). The old Transfers category
 * + children are then removed. Idempotent-ish; safe to re-run.
 *   npx tsx scripts/migrate-transfers-in-out.ts
 */

import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { childSlug, parentSlug } from '@/lib/transactions/taxonomy';

const SUBS = ['Account Transfer', 'Credit Card Payment', 'Loan Payment', 'Student Loan Payment', 'Loan Proceeds', 'Investment Transfer', 'Check'];
const OLD_PARENT_SLUG = parentSlug('transfer', 'Transfers'); // transfers-transfers

async function upsertCategory(v: { slug: string; name: string; color: string; parentId: string | null; sortOrder: number }) {
  const [row] = await db
    .insert(categories)
    .values({ slug: v.slug, name: v.name, color: v.color, flowType: 'transfer', isIncome: false, parentId: v.parentId, sortOrder: v.sortOrder })
    .onConflictDoUpdate({ target: categories.slug, set: { name: v.name, color: v.color, parentId: v.parentId, flowType: 'transfer', isArchived: false } })
    .returning({ id: categories.id });
  return row!.id;
}

async function main() {
  const [oldParent] = await db.select().from(categories).where(eq(categories.slug, OLD_PARENT_SLUG)).limit(1);
  const color = oldParent?.color ?? '#06b6d4';

  // Create the two new parents + their children.
  const legs: { leg: 'In' | 'Out'; cat: string; parentId: string; childBySub: Map<string, string> }[] = [];
  let order = oldParent?.sortOrder ?? 50;
  for (const leg of ['In', 'Out'] as const) {
    const cat = `Transfers ${leg}`;
    const parentId = await upsertCategory({ slug: parentSlug('transfer', cat), name: cat, color, parentId: null, sortOrder: order++ });
    const childBySub = new Map<string, string>();
    let cOrder = 0;
    for (const sub of SUBS) {
      const id = await upsertCategory({ slug: childSlug('transfer', cat, sub), name: sub, color, parentId, sortOrder: cOrder++ });
      childBySub.set(sub, id);
    }
    legs.push({ leg, cat, parentId, childBySub });
  }
  const inLeg = legs.find((l) => l.leg === 'In')!;
  const outLeg = legs.find((l) => l.leg === 'Out')!;
  console.log('  ✓ created Transfers In / Transfers Out (+ sub-categories)');

  // Re-point existing transfer transactions by sign.
  const oldCats = await db.select({ id: categories.id, slug: categories.slug, name: categories.name, parentId: categories.parentId }).from(categories).where(eq(categories.flowType, 'transfer'));
  const oldIds = oldCats.filter((c) => c.slug === OLD_PARENT_SLUG || c.slug.startsWith(OLD_PARENT_SLUG + '-')).map((c) => c.id);
  const oldById = new Map(oldCats.map((c) => [c.id, c]));

  let moved = 0;
  if (oldIds.length > 0) {
    const txns = await db
      .select({ id: transactions.id, categoryId: transactions.categoryId, amount: transactions.amount })
      .from(transactions)
      .where(inArray(transactions.categoryId, oldIds));
    for (const t of txns) {
      const old = t.categoryId ? oldById.get(t.categoryId) : null;
      const isIn = Number(t.amount) >= 0;
      const leg = isIn ? inLeg : outLeg;
      // Map old child → same-named new child; old parent → new parent.
      const sub = old && old.parentId ? old.name : null;
      const newId = sub && leg.childBySub.has(sub) ? leg.childBySub.get(sub)! : leg.parentId;
      await db.update(transactions).set({ categoryId: newId, updatedAt: new Date() }).where(eq(transactions.id, t.id));
      moved++;
    }
  }
  console.log(`  ✓ re-pointed ${moved} transfer transactions by sign`);

  // Remove the old single Transfers category + children (now unused).
  if (oldIds.length > 0) {
    await db.delete(categories).where(and(inArray(categories.id, oldIds), sql`${categories.parentId} IS NOT NULL`));
    await db.delete(categories).where(and(inArray(categories.id, oldIds), sql`${categories.parentId} IS NULL`));
    console.log(`  ✓ removed ${oldIds.length} old Transfers categories`);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
