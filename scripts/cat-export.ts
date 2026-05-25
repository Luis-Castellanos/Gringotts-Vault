/** Dump the taxonomy + the distinct uncategorized merchants for categorization.
 * Read-only.  npx tsx scripts/cat-export.ts */
import 'dotenv/config';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

async function main() {
  const parent = alias(categories, 'p');
  const cats = await db
    .select({ slug: categories.slug, name: categories.name, parent: parent.name, flow: categories.flowType, archived: categories.isArchived })
    .from(categories)
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .orderBy(asc(categories.flowType), asc(parent.name), asc(categories.name));

  console.log('=== TAXONOMY (slug | flow | path) ===');
  for (const c of cats) {
    if (c.archived) continue;
    const path = c.parent ? `${c.parent} > ${c.name}` : c.name;
    console.log(`${c.slug} | ${c.flow} | ${path}`);
  }

  const merch = await db
    .select({
      merchant: transactions.merchant,
      n: sql<number>`count(*)::int`,
      vol: sql<string>`round(sum(abs(${transactions.amount})),2)::text`,
      sample: sql<string>`(array_agg(${transactions.rawDescription}))[1]`,
    })
    .from(transactions)
    .where(eq(transactions.needsReview, true))
    .groupBy(transactions.merchant)
    .orderBy(desc(sql`count(*)`));

  console.log(`\n=== UNCATEGORIZED MERCHANTS (${merch.length} distinct) : count | $vol | merchant ===`);
  for (const m of merch) {
    console.log(`${String(m.n).padStart(3)} | ${Number(m.vol).toFixed(2).padStart(10)} | ${m.merchant ?? '(none)'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
