/**
 * Spending anomalies — categories whose latest-month spend runs materially above
 * their recent baseline ("Dining is 3× your usual, FYI"). Purely informational,
 * in keeping with Vault's anti-prescriptive stance: no budgets, no alerts, just a
 * heads-up. Compares the most recent month present in the ledger against the
 * average of the preceding months. Read-only.
 */

import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

export type Anomaly = {
  categoryId: string;
  name: string;
  color: string | null;
  current: number; // latest-month spend
  baseline: number; // avg monthly spend over the baseline window
  ratio: number; // current / baseline
  delta: number; // current − baseline
  isNew: boolean; // no spend in the baseline window
};
export type AnomalyReport = {
  monthLabel: string | null;
  baselineMonths: number;
  anomalies: Anomaly[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const BASELINE_MONTHS = 6;
const RATIO_THRESHOLD = 2; // ≥2× baseline
const DELTA_THRESHOLD = 75; // and at least $75 more, so tiny categories don't spam
const NEW_THRESHOLD = 150; // brand-new categories surface at ≥ $150

export async function loadAnomalies(): Promise<AnomalyReport> {
  const [{ maxDate } = { maxDate: null }] = await db
    .select({ maxDate: sql<string | null>`MAX(${transactions.date})` })
    .from(transactions);
  if (!maxDate) return { monthLabel: null, baselineMonths: BASELINE_MONTHS, anomalies: [] };

  const target = maxDate.slice(0, 7); // YYYY-MM of the latest activity
  const targetStart = `${target}-01`;
  // First day of the target month, minus BASELINE_MONTHS.
  const d = new Date(targetStart + 'T00:00:00');
  const baselineStart = new Date(d.getFullYear(), d.getMonth() - BASELINE_MONTHS, 1).toISOString().slice(0, 10);

  // Group by category + calendar month, then split current vs baseline in JS.
  // We bucket by a parameter-free month expression (`to_char(date,'YYYY-MM')`)
  // rather than a `date >= $targetStart` boolean: reusing a *parameterized*
  // fragment in both SELECT and GROUP BY emits mismatched placeholder numbers
  // under drizzle ≥0.37, which Postgres rejects ("must appear in GROUP BY").
  const rows = await db
    .select({
      id: sql<string>`COALESCE(${categories.id}::text, 'uncat')`,
      name: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
      color: categories.color,
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      total: sql<string>`SUM(ABS(${transactions.amount}))::text`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, baselineStart),
        lt(transactions.amount, '0'),
        eq(transactions.isTransfer, false),
        eq(transactions.isSplit, false),
        // outflow categories only (uncategorized defaults to outflow)
        ne(sql`COALESCE(${categories.flowType}, 'outflow')`, 'inflow'),
        ne(sql`COALESCE(${categories.flowType}, 'outflow')`, 'transfer'),
      ),
    )
    .groupBy(categories.id, categories.name, categories.color, sql`to_char(${transactions.date}, 'YYYY-MM')`);

  const cur = new Map<string, { name: string; color: string | null; amt: number }>();
  const baseTotal = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.total);
    if (r.month === target) cur.set(r.id, { name: r.name, color: r.color, amt });
    else baseTotal.set(r.id, (baseTotal.get(r.id) ?? 0) + amt);
  }

  const anomalies: Anomaly[] = [];
  for (const [id, c] of cur) {
    const baseline = round2((baseTotal.get(id) ?? 0) / BASELINE_MONTHS);
    const current = round2(c.amt);
    if (baseline <= 0) {
      if (current >= NEW_THRESHOLD) {
        anomalies.push({ categoryId: id, name: c.name, color: c.color, current, baseline: 0, ratio: Infinity, delta: current, isNew: true });
      }
      continue;
    }
    const ratio = current / baseline;
    const delta = round2(current - baseline);
    if (ratio >= RATIO_THRESHOLD && delta >= DELTA_THRESHOLD) {
      anomalies.push({ categoryId: id, name: c.name, color: c.color, current, baseline, ratio: round2(ratio), delta, isNew: false });
    }
  }
  anomalies.sort((a, b) => b.delta - a.delta);

  const monthLabel = new Date(targetStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { monthLabel, baselineMonths: BASELINE_MONTHS, anomalies };
}
