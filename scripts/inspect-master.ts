/**
 * Inspects a master.xlsx without importing anything. Prints every sheet's
 * headers, row count, and a few sample rows so we can audit the file's current
 * shape against the loader's expectations and the category taxonomy.
 *
 * Usage:
 *   npx tsx scripts/inspect-master.ts "C:\path\to\master.xlsx" [sampleRows]
 */

import * as XLSX from 'xlsx';
import { resolve } from 'node:path';

function preview(value: unknown): string {
  if (value == null) return '·';
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return s.length > 32 ? s.slice(0, 29) + '…' : s;
}

function main() {
  const path = process.argv[2];
  const sampleRows = Number(process.argv[3] ?? 4);
  if (!path) {
    console.error('Usage: npx tsx scripts/inspect-master.ts <path-to-master.xlsx> [sampleRows]');
    process.exit(1);
  }

  const full = resolve(path);
  const wb = XLSX.readFile(full, { cellDates: true });
  console.log(`\nFile: ${full}`);
  console.log(`Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}\n`);

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    console.log('─'.repeat(72));
    console.log(`Sheet: "${name}"  —  ${rows.length} rows`);
    console.log(`Columns (${headers.length}): ${headers.join(' | ') || '(empty)'}`);
    if (rows.length > 0) {
      console.log(`Sample (first ${Math.min(sampleRows, rows.length)}):`);
      for (const r of rows.slice(0, sampleRows)) {
        console.log('  ' + headers.map((h) => `${h}=${preview(r[h])}`).join('  '));
      }
      // For taxonomy-ish sheets, list the distinct values of the first 1-2 cols.
      if (/categor|vendor/i.test(name) && headers.length > 0) {
        const distinct = new Set(rows.map((r) => preview(r[headers[0]])));
        console.log(`Distinct "${headers[0]}" (${distinct.size}): ${[...distinct].slice(0, 60).join(', ')}`);
      }
    }
    console.log('');
  }
}

main();
