/**
 * Dumps the Categories sheet (grouped by Type) and clarifies the Vendors sheet
 * structure from a master.xlsx. Read-only audit helper.
 *
 *   npx tsx scripts/inspect-taxonomy.ts "C:\path\to\master.xlsx"
 */

import * as XLSX from 'xlsx';
import { resolve } from 'node:path';

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/inspect-taxonomy.ts <path-to-master.xlsx>');
    process.exit(1);
  }
  const wb = XLSX.readFile(resolve(path), { cellDates: true });

  // --- Categories sheet, grouped by Type --------------------------------
  const cats: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Categories'], { defval: null });
  const byType = new Map<string, Map<string, string[]>>();
  for (const r of cats) {
    const type = String(r['Type'] ?? '—');
    const cat = String(r['Category'] ?? '—');
    const sub = String(r['Sub Category'] ?? r['Sub-category'] ?? '');
    if (!byType.has(type)) byType.set(type, new Map());
    const catMap = byType.get(type)!;
    if (!catMap.has(cat)) catMap.set(cat, []);
    if (sub) catMap.get(cat)!.push(sub);
  }
  console.log(`\n=== CATEGORIES (${cats.length} rows) ===`);
  for (const [type, catMap] of byType) {
    console.log(`\n■ ${type}  (${catMap.size} categories)`);
    for (const [cat, subs] of catMap) {
      console.log(`   ${cat}: ${subs.length ? subs.join(', ') : '(no sub)'}`);
    }
  }

  // --- Vendors sheet: clarify the Category column -----------------------
  const vendors: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Vendors'], { defval: null });
  const vCatCol = new Map<string, number>();
  const vSubCol = new Map<string, number>();
  for (const r of vendors) {
    const c = String(r['Category'] ?? '—');
    const s = String(r['Sub-category'] ?? r['Sub Category'] ?? '—');
    vCatCol.set(c, (vCatCol.get(c) ?? 0) + 1);
    vSubCol.set(s, (vSubCol.get(s) ?? 0) + 1);
  }
  console.log(`\n=== VENDORS (${vendors.length} rows) ===`);
  console.log(`Distinct "Category" values (${vCatCol.size}):`);
  for (const [c, n] of [...vCatCol].sort((a, b) => b[1] - a[1])) console.log(`   ${c}  (${n})`);
  console.log(`Distinct "Sub-category" values: ${vSubCol.size} (first 40): ${[...vSubCol.keys()].slice(0, 40).join(', ')}`);
}

main();
