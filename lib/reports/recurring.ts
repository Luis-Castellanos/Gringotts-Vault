/**
 * Recurring-charge / subscription detection. Scans recent outflows, groups by
 * merchant, and flags merchants billed on a steady cadence (weekly … yearly)
 * with stable amounts. Surfaces the monthly-equivalent burn and the next
 * expected charge. Heuristic + read-only — informational, not prescriptive.
 */

import { and, asc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringCharge = {
  merchant: string;
  cadence: Cadence;
  cadenceDays: number;
  typicalAmount: number;
  monthlyEquivalent: number;
  count: number;
  lastDate: string;
  nextExpected: string;
  active: boolean; // last charge recent enough to still be live
  category: string | null;
};
export type RecurringReport = {
  charges: RecurringCharge[];
  monthlyTotal: number; // active charges only
  yearlyTotal: number;
  activeCount: number;
};

const MS_DAY = 86_400_000;
const CADENCES: { cadence: Cadence; days: number; lo: number; hi: number }[] = [
  { cadence: 'weekly', days: 7, lo: 5, hi: 10 },
  { cadence: 'biweekly', days: 14, lo: 11, hi: 18 },
  { cadence: 'monthly', days: 30.44, lo: 26, hi: 35 },
  { cadence: 'quarterly', days: 91, lo: 82, hi: 98 },
  { cadence: 'yearly', days: 365, lo: 350, hi: 380 },
];

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / MS_DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00') + n * MS_DAY).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export async function loadRecurring(): Promise<RecurringReport> {
  // ~18 months of outflows with a merchant. Amounts are negative for spending.
  const since = addDays(new Date().toISOString().slice(0, 10), -550);
  const rows = await db
    .select({
      merchant: transactions.merchant,
      date: transactions.date,
      amount: transactions.amount,
      category: sql<string | null>`${categories.name}`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, since),
        lt(transactions.amount, '0'),
        eq(transactions.isTransfer, false),
        eq(transactions.isSplit, false),
        isNotNull(transactions.merchant),
      ),
    )
    .orderBy(asc(transactions.merchant), asc(transactions.date));

  const byMerchant = new Map<string, { dates: string[]; amounts: number[]; category: string | null }>();
  for (const r of rows) {
    const m = (r.merchant ?? '').trim();
    if (!m) continue;
    const g = byMerchant.get(m) ?? { dates: [], amounts: [], category: r.category };
    g.dates.push(r.date);
    g.amounts.push(Math.abs(Number(r.amount)));
    byMerchant.set(m, g);
  }

  const today = new Date().toISOString().slice(0, 10);
  const charges: RecurringCharge[] = [];

  for (const [merchant, g] of byMerchant) {
    if (g.dates.length < 3) continue;
    const gaps: number[] = [];
    for (let i = 1; i < g.dates.length; i++) gaps.push(daysBetween(g.dates[i - 1]!, g.dates[i]!));

    // Best cadence = the band matching the most gaps.
    let best: { cadence: Cadence; days: number; matches: number } | null = null;
    for (const c of CADENCES) {
      const matches = gaps.filter((d) => d >= c.lo && d <= c.hi).length;
      if (!best || matches > best.matches) best = { cadence: c.cadence, days: c.days, matches };
    }
    if (!best) continue;
    // Require at least half the intervals (min 2) to fit the cadence.
    if (best.matches < Math.max(2, Math.floor(gaps.length * 0.5))) continue;

    const typicalAmount = round2(median(g.amounts));
    if (typicalAmount <= 0) continue;
    const lastDate = g.dates[g.dates.length - 1]!;
    const monthlyEquivalent = round2(typicalAmount * (30.44 / best.days));
    const active = daysBetween(lastDate, today) <= best.days * 1.8;

    charges.push({
      merchant,
      cadence: best.cadence,
      cadenceDays: Math.round(best.days),
      typicalAmount,
      monthlyEquivalent,
      count: g.dates.length,
      lastDate,
      nextExpected: addDays(lastDate, Math.round(best.days)),
      active,
      category: g.category,
    });
  }

  charges.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
  const active = charges.filter((c) => c.active);
  const monthlyTotal = round2(active.reduce((s, c) => s + c.monthlyEquivalent, 0));

  return {
    charges,
    monthlyTotal,
    yearlyTotal: round2(monthlyTotal * 12),
    activeCount: active.length,
  };
}
