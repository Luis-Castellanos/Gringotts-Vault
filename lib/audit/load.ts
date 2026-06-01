/**
 * Statement audit — reconciles each imported statement's PDF-stated control
 * totals (on `imports`: begin/end balance, stated credit/debit totals) against
 * the figures derived from the parsed rows (sum of `transactions.amount`, the
 * per-row running `balance` chain), and flags coverage gaps between consecutive
 * statements of an account. This is the data-integrity view ("are all my
 * statements loaded, and do they add up?"). Read-only.
 *
 * Mirrors `scripts/audit-preview.ts` (the CLI dry-run) — that script and this
 * loader should stay in agreement.
 */

import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, imports, transactions } from '@/lib/db/schema';

const TOL = 0.01;
const num = (v: string | null): number | null => (v == null ? null : Number(v));
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86_400_000);

export type StmtStatus = 'ok' | 'discrepancy' | 'no_stated';

export type StmtAudit = {
  id: string; // import id
  periodLabel: string;
  start: string | null;
  end: string | null;
  n: number;
  inflowCount: number;
  outflowCount: number;
  begin: number | null;
  finish: number | null;
  derivedEnd: number | null;
  endDelta: number | null; // derived − stated
  statedCredits: number | null;
  parsedInflow: number;
  creditsDelta: number | null;
  statedDebits: number | null;
  parsedOutflow: number;
  debitsDelta: number | null;
  status: StmtStatus;
  gapDaysBefore: number | null; // uncovered days vs previous statement (>0 = gap)
  overlapBefore: boolean;
  sourceFile: string | null;
  documentId: string | null;
};

export type AccountAudit = {
  accountId: string | null;
  accountName: string;
  statements: StmtAudit[];
  okCount: number;
  badCount: number;
  noStatedCount: number;
  gapCount: number;
};

export type AuditSummary = {
  totalStatements: number;
  reconOk: number;
  reconBad: number;
  noStated: number;
  gaps: number;
  accountCount: number;
};

export type StatementAudit = { accounts: AccountAudit[]; summary: AuditSummary };

export async function loadStatementAudit(): Promise<StatementAudit> {
  const [imps, agg] = await Promise.all([
    db
      .select({
        id: imports.id,
        accountId: imports.accountId,
        account: accounts.displayName,
        period: imports.statementPeriod,
        start: imports.periodStart,
        end: imports.periodEnd,
        begin: imports.beginningBalance,
        finish: imports.endingBalance,
        credits: imports.statedCredits,
        debits: imports.statedDebits,
        file: imports.sourceFile,
        documentId: imports.documentId,
      })
      .from(imports)
      .leftJoin(accounts, eq(accounts.id, imports.accountId))
      .orderBy(asc(accounts.displayName), asc(imports.periodStart)),
    db
      .select({
        importId: transactions.importId,
        n: sql<number>`count(*)::int`,
        inflowCount: sql<number>`count(*) filter (where ${transactions.amount} > 0)::int`,
        outflowCount: sql<number>`count(*) filter (where ${transactions.amount} < 0)::int`,
        net: sql<string>`coalesce(sum(${transactions.amount}),0)::text`,
        inflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} > 0),0)::text`,
        outflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} < 0),0)::text`,
      })
      .from(transactions)
      .groupBy(transactions.importId),
  ]);
  const byImport = new Map(agg.map((a) => [a.importId, a]));

  const grouped = new Map<string, { accountId: string | null; name: string; rows: typeof imps }>();
  for (const i of imps) {
    const key = i.accountId ?? '__unknown__';
    const name = i.account ?? '(unassigned)';
    const g = grouped.get(key) ?? { accountId: i.accountId, name, rows: [] as typeof imps };
    g.rows.push(i);
    grouped.set(key, g);
  }

  const summary: AuditSummary = { totalStatements: 0, reconOk: 0, reconBad: 0, noStated: 0, gaps: 0, accountCount: grouped.size };
  const accountsOut: AccountAudit[] = [];

  for (const g of grouped.values()) {
    const statements: StmtAudit[] = [];
    let prevEnd: string | null = null;
    let okCount = 0, badCount = 0, noStatedCount = 0, gapCount = 0;

    for (const s of g.rows) {
      summary.totalStatements += 1;
      const d = byImport.get(s.id);
      const n = d?.n ?? 0;
      const inflowCount = d?.inflowCount ?? 0;
      const outflowCount = d?.outflowCount ?? 0;
      const net = num(d?.net ?? null) ?? 0;
      const inflow = num(d?.inflow ?? null) ?? 0;
      const outflow = Math.abs(num(d?.outflow ?? null) ?? 0);
      const begin = num(s.begin);
      const finish = num(s.finish);
      const credits = num(s.credits);
      const debits = num(s.debits);

      let gapDaysBefore: number | null = null;
      let overlapBefore = false;
      if (prevEnd && s.start) {
        const gap = daysBetween(prevEnd, s.start);
        if (gap > 1) { gapDaysBefore = gap - 1; gapCount += 1; summary.gaps += 1; }
        else if (gap < 0) overlapBefore = true;
      }
      prevEnd = s.end ?? prevEnd;

      const derivedEnd = begin != null ? Math.round((begin + net) * 100) / 100 : null;
      const endDelta = derivedEnd != null && finish != null ? Math.round((derivedEnd - finish) * 100) / 100 : null;
      const creditsDelta = credits != null ? Math.round((inflow - credits) * 100) / 100 : null;
      const debitsDelta = debits != null ? Math.round((outflow - debits) * 100) / 100 : null;

      let status: StmtStatus;
      if (begin == null && finish == null && credits == null && debits == null) {
        status = 'no_stated';
        noStatedCount += 1;
        summary.noStated += 1;
      } else {
        const bad =
          (endDelta != null && Math.abs(endDelta) > TOL) ||
          (creditsDelta != null && Math.abs(creditsDelta) > TOL) ||
          (debitsDelta != null && Math.abs(debitsDelta) > TOL);
        status = bad ? 'discrepancy' : 'ok';
        if (bad) { badCount += 1; summary.reconBad += 1; } else { okCount += 1; summary.reconOk += 1; }
      }

      statements.push({
        id: s.id,
        periodLabel: s.period ?? `${s.start ?? '?'} – ${s.end ?? '?'}`,
        start: s.start,
        end: s.end,
        n,
        inflowCount,
        outflowCount,
        begin,
        finish,
        derivedEnd,
        endDelta,
        statedCredits: credits,
        parsedInflow: Math.round(inflow * 100) / 100,
        creditsDelta,
        statedDebits: debits,
        parsedOutflow: Math.round(outflow * 100) / 100,
        debitsDelta,
        status,
        gapDaysBefore,
        overlapBefore,
        sourceFile: s.file,
        documentId: s.documentId,
      });
    }

    accountsOut.push({
      accountId: g.accountId,
      accountName: g.name,
      statements,
      okCount,
      badCount,
      noStatedCount,
      gapCount,
    });
  }

  // Accounts with discrepancies/gaps first, then by name.
  accountsOut.sort((a, b) => {
    const aw = a.badCount + a.gapCount;
    const bw = b.badCount + b.gapCount;
    if (aw !== bw) return bw - aw;
    return a.accountName.localeCompare(b.accountName);
  });

  return { accounts: accountsOut, summary };
}

// ---------------------------------------------------------------------------
// Per-statement balance-chain drill-down (the /api/audit/[importId] route).
// ---------------------------------------------------------------------------

export type ChainRow = {
  id: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  printedBalance: number | null;
  expectedBalance: number | null;
  delta: number | null; // printed − expected
  broken: boolean;
};

export type ChainAudit = {
  importId: string;
  periodLabel: string;
  accountName: string;
  begin: number | null;
  finish: number | null;
  derivedEnd: number | null;
  endDelta: number | null;
  statedCredits: number | null;
  parsedInflow: number;
  inflowCount: number;
  creditsDelta: number | null;
  statedDebits: number | null;
  parsedOutflow: number;
  outflowCount: number;
  debitsDelta: number | null;
  hasPrintedBalances: boolean;
  reconcilesAtEnd: boolean;
  firstBreakIndex: number | null;
  sourceFile: string | null;
  documentId: string | null;
  rows: ChainRow[];
};

export async function loadStatementChain(importId: string): Promise<ChainAudit | null> {
  const [imp] = await db
    .select({
      id: imports.id,
      account: accounts.displayName,
      period: imports.statementPeriod,
      start: imports.periodStart,
      end: imports.periodEnd,
      begin: imports.beginningBalance,
      finish: imports.endingBalance,
      credits: imports.statedCredits,
      debits: imports.statedDebits,
      file: imports.sourceFile,
      documentId: imports.documentId,
    })
    .from(imports)
    .leftJoin(accounts, eq(accounts.id, imports.accountId))
    .where(eq(imports.id, importId))
    .limit(1);
  if (!imp) return null;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.rawDescription,
      merchant: transactions.merchant,
      amount: transactions.amount,
      balance: transactions.balance,
    })
    .from(transactions)
    .where(and(eq(transactions.importId, importId)))
    .orderBy(asc(transactions.date), asc(transactions.id));

  const begin = num(imp.begin);
  const finish = num(imp.finish);
  const statedCredits = num(imp.credits);
  const statedDebits = num(imp.debits);
  const hasPrintedBalances = rows.some((r) => r.balance != null);

  // Anchor the expected-balance chain. Prefer the stated beginning balance;
  // otherwise back into it from the first printed balance so row 0 reconciles
  // and downstream breaks still surface.
  let anchor = begin;
  if (anchor == null && hasPrintedBalances) {
    const first = rows.find((r) => r.balance != null)!;
    anchor = Number(first.balance) - Number(first.amount);
  }

  let running = anchor;
  const out: ChainRow[] = rows.map((r) => {
    const amount = Number(r.amount);
    const printed = r.balance != null ? Number(r.balance) : null;
    running = running != null ? Math.round((running + amount) * 100) / 100 : null;
    const expected = running;
    const delta = printed != null && expected != null ? Math.round((printed - expected) * 100) / 100 : null;
    return {
      id: r.id,
      date: r.date,
      description: r.description,
      merchant: r.merchant,
      amount,
      printedBalance: printed,
      expectedBalance: expected,
      delta,
      broken: delta != null && Math.abs(delta) > TOL,
    };
  });

  const firstBreakIndex = out.findIndex((r) => r.broken);
  const lastPrinted = [...out].reverse().find((r) => r.printedBalance != null);
  const reconcilesAtEnd = lastPrinted ? lastPrinted.delta == null || Math.abs(lastPrinted.delta) <= TOL : true;
  const net = out.reduce((s, r) => s + r.amount, 0);
  const parsedInflow = Math.round(out.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const parsedOutflow = Math.round(Math.abs(out.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0)) * 100) / 100;
  const inflowCount = out.filter((r) => r.amount > 0).length;
  const outflowCount = out.filter((r) => r.amount < 0).length;
  const derivedEnd = begin != null ? Math.round((begin + net) * 100) / 100 : null;
  const endDelta = derivedEnd != null && finish != null ? Math.round((derivedEnd - finish) * 100) / 100 : null;
  const creditsDelta = statedCredits != null ? Math.round((parsedInflow - statedCredits) * 100) / 100 : null;
  const debitsDelta = statedDebits != null ? Math.round((parsedOutflow - statedDebits) * 100) / 100 : null;

  return {
    importId,
    periodLabel: imp.period ?? `${imp.start ?? '?'} – ${imp.end ?? '?'}`,
    accountName: imp.account ?? '(unassigned)',
    begin,
    finish,
    derivedEnd,
    endDelta,
    statedCredits,
    parsedInflow,
    inflowCount,
    creditsDelta,
    statedDebits,
    parsedOutflow,
    outflowCount,
    debitsDelta,
    hasPrintedBalances,
    reconcilesAtEnd,
    firstBreakIndex: firstBreakIndex < 0 ? null : firstBreakIndex,
    sourceFile: imp.file,
    documentId: imp.documentId,
    rows: out,
  };
}
