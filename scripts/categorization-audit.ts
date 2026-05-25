/**
 * How did vendor-map categorization do on the current ledger? Read-only.
 *   npx tsx scripts/categorization-audit.ts
 */
import 'dotenv/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

async function main() {
  const [tot] = await db
    .select({
      n: sql<number>`count(*)::int`,
      review: sql<number>`count(*) filter (where ${transactions.needsReview})::int`,
      done: sql<number>`count(*) filter (where not ${transactions.needsReview})::int`,
      reviewMerchants: sql<number>`count(distinct ${transactions.merchant}) filter (where ${transactions.needsReview})::int`,
    })
    .from(transactions);

  const total = tot!.n;
  if (total === 0) { console.log('No transactions in the ledger.'); process.exit(0); }
  const pct = (x: number) => `${((x / total) * 100).toFixed(1)}%`;

  console.log('=== categorization coverage ===');
  console.log(`  total transactions : ${total}`);
  console.log(`  auto-categorized   : ${tot!.done} (${pct(tot!.done)})`);
  console.log(`  needs review       : ${tot!.review} (${pct(tot!.review)})  across ${tot!.reviewMerchants} distinct merchants`);

  const parent = alias(categories, 'parent_cat');
  const cats = await db
    .select({
      cat: categories.name,
      parent: parent.name,
      flow: categories.flowType,
      n: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .where(eq(transactions.needsReview, false))
    .groupBy(categories.name, parent.name, categories.flowType)
    .orderBy(desc(sql`count(*)`))
    .limit(18);

  console.log('\n=== top auto-assigned categories ===');
  for (const c of cats) {
    const label = c.parent ? `${c.parent} › ${c.cat}` : (c.cat ?? '—');
    console.log(`  ${String(c.n).padStart(4)}  [${c.flow ?? '—'}] ${label}`);
  }

  const merch = await db
    .select({
      merchant: transactions.merchant,
      n: sql<number>`count(*)::int`,
      vol: sql<string>`sum(abs(${transactions.amount}))::text`,
    })
    .from(transactions)
    .where(eq(transactions.needsReview, true))
    .groupBy(transactions.merchant)
    .orderBy(desc(sql`count(*)`))
    .limit(25);

  console.log('\n=== biggest unknown merchants (the review backlog) ===');
  for (const m of merch) {
    console.log(`  ${String(m.n).padStart(4)}  $${Number(m.vol).toFixed(2).padStart(11)}  ${m.merchant ?? '(no merchant)'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
