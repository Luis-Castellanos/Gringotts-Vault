/**
 * Seed vendor_rules from a master.xlsx — the "early version" of the vendor map
 * embedded in your already-categorized history. For each transaction row with a
 * filled Category, it normalizes the Source the same way ingest does
 * (cleanMerchant) and tallies which category that merchant was given most often;
 * the winner becomes the rule (source = 'master').
 *
 *   npx tsx scripts/seed-vendor-rules.ts "C:\path\to\master.xlsx"
 *
 * Idempotent + non-destructive: existing rules (e.g. 'confirmed' ones you set in
 * Review) are NOT overwritten (ON CONFLICT DO NOTHING on merchant).
 */

import 'dotenv/config';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';

import { db } from '@/lib/db/client';
import { categories, transactions, vendorRules } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';
import { childSlug, parentSlug, typeToFlow, UNCATEGORIZED_SLUG } from '@/lib/transactions/taxonomy';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/seed-vendor-rules.ts <path-to-master.xlsx>');
    process.exit(1);
  }
  const wb = XLSX.readFile(resolve(path), { cellDates: true });
  const sheetName = wb.SheetNames.includes('Transactions') ? 'Transactions' : wb.SheetNames[0]!;
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { defval: null });
  console.log(`Reading "${sheetName}" — ${rows.length} rows`);

  // slug → categoryId from the live taxonomy.
  const cats = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  // merchant → (slug → count)
  const tally = new Map<string, Map<string, number>>();
  let skippedNoCat = 0;
  const unmatchedSlug = new Map<string, number>();

  for (const r of rows) {
    const source = String(r['Source'] ?? '').trim();
    const cat = String(r['Category'] ?? '').trim();
    if (!source || !cat) {
      skippedNoCat++;
      continue;
    }
    const type = String(r['Type'] ?? '').trim();
    const sub = String(r['Sub-category'] ?? '').trim();
    const flow = typeToFlow(type);
    const slug = sub ? childSlug(flow, cat, sub) : parentSlug(flow, cat);
    if (slug === UNCATEGORIZED_SLUG) continue;
    const merchant = cleanMerchant(source);
    if (!merchant) continue;
    const m = tally.get(merchant) ?? new Map<string, number>();
    m.set(slug, (m.get(slug) ?? 0) + 1);
    tally.set(merchant, m);
  }

  let inserted = 0;
  let skippedUnknownSlug = 0;
  for (const [merchant, slugs] of tally) {
    // Most-frequent category for this merchant.
    const [bestSlug, count] = [...slugs.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const categoryId = idBySlug.get(bestSlug);
    if (!categoryId) {
      skippedUnknownSlug++;
      unmatchedSlug.set(bestSlug, (unmatchedSlug.get(bestSlug) ?? 0) + 1);
      continue;
    }
    const res = await db
      .insert(vendorRules)
      .values({ merchant, categoryId, source: 'master', hitCount: count })
      .onConflictDoNothing({ target: vendorRules.merchant })
      .returning({ id: vendorRules.id });
    inserted += res.length;
  }

  console.log(`\nDone. ${tally.size} distinct merchants → ${inserted} new rules.`);
  console.log(`  Skipped: ${skippedNoCat} uncategorized rows, ${skippedUnknownSlug} merchants whose slug isn't in the taxonomy.`);
  if (unmatchedSlug.size > 0) {
    console.log('  Unmatched slugs:', [...unmatchedSlug.keys()].slice(0, 20).join(', '));
  }

  // Optionally back-apply the map to transactions already sitting in the queue.
  if (process.argv.includes('--apply')) {
    const rules = await db.select({ merchant: vendorRules.merchant, categoryId: vendorRules.categoryId }).from(vendorRules);
    let applied = 0;
    for (const r of rules) {
      const u = await db
        .update(transactions)
        .set({ categoryId: r.categoryId, needsReview: false, updatedAt: new Date() })
        .where(and(eq(transactions.merchant, r.merchant), eq(transactions.needsReview, true)))
        .returning({ id: transactions.id });
      applied += u.length;
    }
    console.log(`  --apply: auto-categorized ${applied} existing needs-review transactions.`);
  } else {
    console.log('  (Run with --apply to also auto-categorize existing needs-review transactions.)');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
