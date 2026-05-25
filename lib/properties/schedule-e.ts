/**
 * Schedule E (Form 1040, Part I) worksheet for a property + tax year. Maps the
 * property's attributed income/expenses onto the IRS expense lines. The mapping
 * is a keyword heuristic on the category name (no re-categorizing needed); split
 * parts (mortgage interest from a payment split) go to line 12. Depreciation
 * (line 18) is Phase 6. Self-contained — resolves the property's rollup accounts.
 */

import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { categories, properties, transactions, transactionSplits } from '@/lib/db/schema';
import { computeDepreciation } from './depreciation';
import { loadCapex } from './capex';
import { SE_LINE_DEFS, resolveLineKey } from './schedule-e-lines';

export type ScheduleELine = { line: number; key: string; label: string; amount: number };
export type ScheduleE = {
  propertyId: string;
  propertyName: string;
  year: number;
  rents: number; // line 3
  lines: ScheduleELine[]; // expense lines 5–19 (line 18 depreciation = 0 for now)
  totalExpenses: number;
  netIncome: number; // rents − total expenses
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadScheduleE(propertyId: string, year: number): Promise<ScheduleE | null> {
  const [prop] = await db
    .select({
      name: properties.name,
      mortgageAccountId: properties.mortgageAccountId,
      escrowAccountId: properties.escrowAccountId,
      acquisitionPrice: properties.acquisitionPrice,
      acquisitionDate: properties.acquisitionDate,
      landValuePct: properties.landValuePct,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!prop) return null;

  const accountIds = [prop.mortgageAccountId, prop.escrowAccountId].filter((x): x is string => !!x);
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const attributed = accountIds.length
    ? or(eq(transactions.propertyId, propertyId), inArray(transactions.accountId, accountIds))
    : eq(transactions.propertyId, propertyId);
  const parent = alias(transactions, 'se_parent');

  const [regular, splits] = await Promise.all([
    db
      .select({
        amount: transactions.amount,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        catName: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        seLine: categories.scheduleELine,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(attributed, eq(transactions.isSplit, false), eq(transactions.isTransfer, false), gte(transactions.date, start), lte(transactions.date, end))),
    db
      .select({ amount: transactionSplits.amount })
      .from(transactionSplits)
      .innerJoin(parent, eq(transactionSplits.transactionId, parent.id))
      .where(
        and(
          eq(transactionSplits.isTransfer, false),
          gte(parent.date, start),
          lte(parent.date, end),
          accountIds.length
            ? or(eq(parent.propertyId, propertyId), inArray(parent.accountId, accountIds))
            : eq(parent.propertyId, propertyId),
        ),
      ),
  ]);

  let rents = 0;
  const byKey = new Map<string, number>();
  for (const r of regular) {
    const amt = Number(r.amount);
    if (r.flow === 'transfer') continue;
    if (r.flow === 'inflow') rents += amt;
    else {
      const key = resolveLineKey(r.catName, r.seLine);
      byKey.set(key, (byKey.get(key) ?? 0) + Math.abs(amt));
    }
  }
  // Split parts (mortgage interest) → line 12.
  for (const s of splits) byKey.set('mortgage_interest', (byKey.get('mortgage_interest') ?? 0) + Math.abs(Number(s.amount)));

  // Depreciation → line 18 (building + capital improvements in service this year).
  const dep = computeDepreciation(
    {
      acquisitionPrice: prop.acquisitionPrice != null ? Number(prop.acquisitionPrice) : null,
      acquisitionDate: prop.acquisitionDate,
      landValuePct: prop.landValuePct != null ? Number(prop.landValuePct) : null,
    },
    (await loadCapex(propertyId)).map((c) => ({ description: c.description, cost: c.cost, placedInService: c.placedInService, usefulLifeYears: c.usefulLifeYears })),
    year,
  );
  if (dep.annualTotal > 0) byKey.set('depreciation', dep.annualTotal);

  const lines = SE_LINE_DEFS.map((d) => ({ ...d, amount: round2(byKey.get(d.key) ?? 0) }));
  const totalExpenses = round2(lines.reduce((s, l) => s + l.amount, 0));
  return {
    propertyId,
    propertyName: prop.name,
    year,
    rents: round2(rents),
    lines,
    totalExpenses,
    netIncome: round2(rents - totalExpenses),
  };
}
