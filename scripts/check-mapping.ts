/**
 * Read-only audit: how cleanly will the loader categorize the Transactions sheet
 * against the Categories taxonomy? Computes the same slugs the loader uses and
 * reports matched vs. unmatched rows WITHOUT touching the DB. Run this before a
 * destructive re-import to confirm the mapping quality.
 *
 *   npx tsx scripts/check-mapping.ts "C:\path\to\master.xlsx"
 */

import * as XLSX from 'xlsx';
import { resolve } from 'node:path';
import { childSlug, parentSlug, typeToFlow } from '@/lib/transactions/taxonomy';

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/check-mapping.ts <path-to-master.xlsx>');
    process.exit(1);
  }
  const wb = XLSX.readFile(resolve(path), { cellDates: true });

  // Build the set of valid slugs from the Categories sheet.
  const valid = new Set<string>();
  const cats: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Categories'], { defval: null });
  for (const r of cats) {
    const type = String(r['Type'] ?? '').trim();
    const cat = String(r['Category'] ?? '').trim();
    const sub = String(r['Sub Category'] ?? '').trim();
    if (!type || !cat) continue;
    const flow = typeToFlow(type);
    valid.add(parentSlug(flow, cat));
    if (sub) valid.add(childSlug(flow, cat, sub));
  }

  // Resolve every transaction row.
  const txns: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Transactions'], { defval: null });
  let matched = 0;
  let matchedParentOnly = 0;
  const unmatched = new Map<string, number>();
  const flowCounts = { inflow: 0, outflow: 0, transfer: 0 };

  for (const r of txns) {
    const type = String(r['Type'] ?? '').trim();
    const cat = String(r['Category'] ?? '').trim();
    const sub = String(r['Sub-category'] ?? '').trim();
    const flow = typeToFlow(type);
    flowCounts[flow]++;

    if (sub) {
      if (valid.has(childSlug(flow, cat, sub))) { matched++; continue; }
    } else if (valid.has(parentSlug(flow, cat))) {
      matchedParentOnly++; continue;
    }
    const key = `${type || '∅'} / ${cat || '∅'} / ${sub || '∅'}`;
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const total = txns.length;
  const unmatchedTotal = [...unmatched.values()].reduce((a, b) => a + b, 0);
  console.log(`\nTransactions: ${total}`);
  console.log(`  matched (child):       ${matched}`);
  console.log(`  matched (parent only): ${matchedParentOnly}`);
  console.log(`  UNMATCHED:             ${unmatchedTotal}  (${((unmatchedTotal / total) * 100).toFixed(1)}%)`);
  console.log(`  flow split: inflow=${flowCounts.inflow}  outflow=${flowCounts.outflow}  transfer=${flowCounts.transfer}`);

  if (unmatched.size > 0) {
    console.log(`\nUnmatched (Type / Category / Sub-category), top 40 by count:`);
    for (const [key, n] of [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
      console.log(`  ${n.toString().padStart(5)}  ${key}`);
    }
  }
}

main();
