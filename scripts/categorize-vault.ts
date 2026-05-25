/**
 * Bulk rule-based categorization of needs-review transactions, using the shared
 * rule set (lib/categorize/rules.ts) and the category taxonomy.
 *
 * High-confidence matches (transfers, Zelle, ATM, income, fees) are CONFIRMED
 * (needs_review = false). Low-confidence spend keywords are SUGGESTED (category
 * set, needs_review stays true) so they still surface for a quick confirm.
 *
 *   npx tsx scripts/categorize-vault.ts            # dry run (summary only)
 *   npx tsx scripts/categorize-vault.ts --apply    # write
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { classifyByRules } from '@/lib/categorize/rules';

async function main() {
  const apply = process.argv.includes('--apply');
  const cats = await db.select({ id: categories.id, slug: categories.slug, flow: categories.flowType }).from(categories);
  const bySlug = new Map(cats.map((c) => [c.slug, c]));

  const txns = await db
    .select({ id: transactions.id, raw: transactions.rawDescription, amount: transactions.amount })
    .from(transactions)
    .where(eq(transactions.needsReview, true));

  const counts = new Map<string, number>();
  const groups = new Map<string, { categoryId: string; needsReview: boolean; isTransfer: boolean; ids: string[] }>();
  const missingSlugs = new Set<string>();
  let high = 0, low = 0, unmatched = 0;
  const unmatchedSample: string[] = [];

  for (const t of txns) {
    const hit = classifyByRules(t.raw, Number(t.amount));
    if (!hit) { unmatched++; if (unmatchedSample.length < 30) unmatchedSample.push(t.raw); continue; }
    const cat = bySlug.get(hit.slug);
    if (!cat) { missingSlugs.add(hit.slug); continue; }
    counts.set(hit.slug, (counts.get(hit.slug) ?? 0) + 1);
    if (hit.confidence === 'high') high++; else low++;
    const needsReview = hit.confidence === 'low'; // high-confidence → confirmed
    const isTransfer = cat.flow === 'transfer';
    const key = `${cat.id}|${needsReview}|${isTransfer}`;
    const g = groups.get(key) ?? { categoryId: cat.id, needsReview, isTransfer, ids: [] };
    g.ids.push(t.id);
    groups.set(key, g);
  }

  if (missingSlugs.size) { console.error('ABORT — rule slugs not in taxonomy:', [...missingSlugs]); process.exit(1); }

  console.log(`needs-review transactions: ${txns.length}`);
  console.log(`  matched: ${high + low}  (confirm ${high} / suggest ${low})   unmatched: ${unmatched}`);
  console.log('\n=== category distribution (matched) ===');
  for (const [slug, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(4)}  ${slug}`);
  console.log('\n=== sample unmatched (stay in review) ===');
  for (const u of unmatchedSample) console.log(`  ${u.slice(0, 90)}`);

  if (!apply) { console.log('\n(dry run — re-run with --apply to write)'); process.exit(0); }

  let written = 0;
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 500) {
      const batch = g.ids.slice(i, i + 500);
      await db.update(transactions)
        .set({ categoryId: g.categoryId, needsReview: g.needsReview, isTransfer: g.isTransfer, updatedAt: new Date() })
        .where(inArray(transactions.id, batch));
      written += batch.length;
    }
  }
  console.log(`\nApplied to ${written} transactions.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
