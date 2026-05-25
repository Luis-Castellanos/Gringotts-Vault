/**
 * Re-parse every stored bank statement with the CURRENT parser and reconcile it
 * (stated begin + parsed flows == stated end; parsed vs stated deposit/withdrawal
 * totals). Read-only — never writes. Validates parser changes before reprocessing.
 *   npx tsx scripts/verify-parse.ts
 */
import 'dotenv/config';
import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { runExtractor } from '@/lib/parser/extract';

const TOL = 0.01;
const f = (n: number | null | undefined) => (n == null ? '   —' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2));

async function main() {
  const docs = await db
    .select({ id: documents.id, fileName: documents.fileName, data: documents.data, status: documents.status, type: documents.detectedType })
    .from(documents)
    .orderBy(asc(documents.fileName));
  const typeCounts = new Map<string, number>();
  for (const d of docs) typeCounts.set(d.type, (typeCounts.get(d.type) ?? 0) + 1);
  console.log('detectedType distribution:', Object.fromEntries(typeCounts));
  const bank = docs.filter((d) => d.type === 'bank');
  console.log(`Re-parsing ${bank.length} bank statements…\n`);

  let ok = 0, bad = 0, noStated = 0;
  for (const d of bank) {
    const res = await runExtractor(d.data as Buffer, d.fileName);
    if (!res.ok) { console.log(`  ✗ ${d.fileName}: ${res.error}`); bad++; continue; }
    const txns = res.transactions;
    const inflow = txns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const outflow = Math.abs(txns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0));
    const net = txns.reduce((s, t) => s + t.amount, 0);
    const sm = res.summary;
    const begin = sm?.beginning_balance ?? null;
    const end = sm?.ending_balance ?? null;
    const cr = sm?.stated_credits ?? null;
    const dr = sm?.stated_debits ?? null;

    const flags: string[] = [];
    let status = '✓';
    if (begin != null && end != null) {
      if (Math.abs(begin + net - end) > TOL) flags.push(`end Δ ${(begin + net - end).toFixed(2)} (derived ${f(begin + net)} vs ${f(end)})`);
    } else { status = '·'; }
    if (cr != null && Math.abs(inflow - cr) > TOL) flags.push(`deposits ${f(inflow)} vs stated ${f(cr)} (Δ ${(inflow - cr).toFixed(2)})`);
    if (dr != null && Math.abs(outflow - dr) > TOL) flags.push(`withdrawals ${f(outflow)} vs stated ${f(dr)} (Δ ${(outflow - dr).toFixed(2)})`);
    if (flags.length) status = '⚠';

    if (status === '✓') ok++; else if (status === '⚠') bad++; else noStated++;
    if (status !== '✓') {
      console.log(`  ${status} ${d.fileName}  (n=${txns.length})`);
      for (const fl of flags) console.log(`        ↳ ${fl}`);
    }
  }
  console.log(`\n=== ${bank.length} statements: ${ok} reconcile ✓ · ${bad} discrepancy ⚠ · ${noStated} no stated balance · ===`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
