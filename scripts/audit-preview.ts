/**
 * Statement audit preview — a CLI dry-run of the future audit page. For each
 * statement (imports row): stated begin→end vs. derived end, the reconcile
 * delta, stated-vs-parsed deposit/withdrawal totals, transaction count, and
 * coverage gaps between consecutive statements. Read-only.
 *   npx tsx scripts/audit-preview.ts
 */
import 'dotenv/config';
import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, imports, transactions } from '@/lib/db/schema';

const TOL = 0.01;
const num = (v: string | null) => (v == null ? null : Number(v));
const money = (n: number | null) => (n == null ? '      —' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2));
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86_400_000);
const addDay = (iso: string) => new Date(Date.parse(iso + 'T00:00:00') + 86_400_000).toISOString().slice(0, 10);

async function main() {
  const imps = await db
    .select({
      id: imports.id, accountId: imports.accountId, account: accounts.name,
      period: imports.statementPeriod, start: imports.periodStart, end: imports.periodEnd,
      begin: imports.beginningBalance, finish: imports.endingBalance,
      credits: imports.statedCredits, debits: imports.statedDebits, file: imports.sourceFile,
    })
    .from(imports)
    .leftJoin(accounts, eq(accounts.id, imports.accountId))
    .orderBy(asc(accounts.name), asc(imports.periodStart));

  // Derived figures per import (from the actual parsed rows).
  const agg = await db
    .select({
      importId: transactions.importId,
      n: sql<number>`count(*)::int`,
      net: sql<string>`coalesce(sum(${transactions.amount}),0)::text`,
      inflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} > 0),0)::text`,
      outflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} < 0),0)::text`,
    })
    .from(transactions)
    .groupBy(transactions.importId);
  const byImport = new Map(agg.map((a) => [a.importId, a]));

  // Group statements by account.
  const byAccount = new Map<string, typeof imps>();
  for (const i of imps) {
    const k = i.account ?? '(unknown account)';
    (byAccount.get(k) ?? byAccount.set(k, []).get(k)!).push(i);
  }

  let totalStmts = 0, reconOk = 0, reconBad = 0, noStated = 0, gaps = 0;

  for (const [account, stmts] of byAccount) {
    console.log(`\n━━━ ${account} — ${stmts.length} statements ━━━`);
    let prevEnd: string | null = null;
    for (const s of stmts) {
      totalStmts++;
      const d = byImport.get(s.id);
      const n = d?.n ?? 0;
      const net = num(d?.net ?? null) ?? 0;
      const inflow = num(d?.inflow ?? null) ?? 0;
      const outflow = Math.abs(num(d?.outflow ?? null) ?? 0);
      const begin = num(s.begin), finish = num(s.finish);
      const credits = num(s.credits), debits = num(s.debits);

      // Coverage gap vs previous statement.
      if (prevEnd && s.start) {
        const gap = daysBetween(prevEnd, s.start);
        if (gap > 1) { console.log(`    ⚠ GAP — ${gap - 1} day(s) uncovered (${addDay(prevEnd)} … ${s.start})`); gaps++; }
        else if (gap < 0) console.log(`    ⚠ OVERLAP with previous statement (${s.start} ≤ ${prevEnd})`);
      }
      prevEnd = s.end ?? prevEnd;

      const flags: string[] = [];
      let status = '✓';
      if (begin != null && finish != null) {
        const derivedEnd = begin + net;
        if (Math.abs(derivedEnd - finish) > TOL) { status = '⚠'; flags.push(`end Δ ${(derivedEnd - finish).toFixed(2)} (derived ${money(derivedEnd)} vs stated ${money(finish)})`); }
      } else { status = '·'; noStated++; }
      if (credits != null && Math.abs(inflow - credits) > TOL) { status = '⚠'; flags.push(`deposits parsed ${money(inflow)} vs stated ${money(credits)} (Δ ${(inflow - credits).toFixed(2)})`); }
      if (debits != null && Math.abs(outflow - debits) > TOL) { status = '⚠'; flags.push(`withdrawals parsed ${money(outflow)} vs stated ${money(debits)} (Δ ${(outflow - debits).toFixed(2)})`); }

      if (status === '✓') reconOk++; else if (status === '⚠') reconBad++;

      const per = s.period ?? `${s.start ?? '?'}–${s.end ?? '?'}`;
      console.log(`  ${status} ${per}  n=${String(n).padStart(3)}  ${money(begin)} → ${money(finish)}  cr ${money(credits)} dr ${money(debits)}`);
      for (const f of flags) console.log(`        ↳ ${f}`);
    }
  }

  console.log(`\n=== summary ===`);
  console.log(`  statements: ${totalStmts}`);
  console.log(`  reconcile ✓: ${reconOk}   discrepancies ⚠: ${reconBad}   no stated balances ·: ${noStated}`);
  console.log(`  coverage gaps: ${gaps}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
