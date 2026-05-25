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

// Ordered: first match wins, so specific patterns precede generic ones.
const RULES: { re: RegExp; key: string }[] = [
  { re: /advertis|marketing|listing/i, key: 'advertising' },
  { re: /auto|travel|mileage/i, key: 'auto_travel' },
  { re: /clean/i, key: 'cleaning' },
  { re: /commission/i, key: 'commissions' },
  { re: /insurance/i, key: 'insurance' },
  { re: /legal|attorney|accounting|professional|tax prep/i, key: 'legal' },
  { re: /manage|mgmt/i, key: 'management' },
  { re: /interest/i, key: 'mortgage_interest' },
  { re: /repair|fix|plumb|hvac|electric(?!ity)|appliance/i, key: 'repairs' },
  { re: /suppl/i, key: 'supplies' },
  { re: /property tax|prop tax|\btax(es)?\b/i, key: 'taxes' },
  { re: /utilit|electric|water|sewer|\bgas\b|trash|internet|cable/i, key: 'utilities' },
  { re: /maintenance|hoa|lawn|landscap|pest|turnover/i, key: 'cleaning' },
];

const LINE_DEFS: { line: number; key: string; label: string }[] = [
  { line: 5, key: 'advertising', label: 'Advertising' },
  { line: 6, key: 'auto_travel', label: 'Auto and travel' },
  { line: 7, key: 'cleaning', label: 'Cleaning and maintenance' },
  { line: 8, key: 'commissions', label: 'Commissions' },
  { line: 9, key: 'insurance', label: 'Insurance' },
  { line: 10, key: 'legal', label: 'Legal and other professional fees' },
  { line: 11, key: 'management', label: 'Management fees' },
  { line: 12, key: 'mortgage_interest', label: 'Mortgage interest (banks, etc.)' },
  { line: 14, key: 'repairs', label: 'Repairs' },
  { line: 15, key: 'supplies', label: 'Supplies' },
  { line: 16, key: 'taxes', label: 'Taxes' },
  { line: 17, key: 'utilities', label: 'Utilities' },
  { line: 18, key: 'depreciation', label: 'Depreciation expense' },
  { line: 19, key: 'other', label: 'Other' },
];

function lineKeyFor(categoryName: string): string {
  for (const r of RULES) if (r.re.test(categoryName)) return r.key;
  return 'other';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadScheduleE(propertyId: string, year: number): Promise<ScheduleE | null> {
  const [prop] = await db
    .select({ name: properties.name, mortgageAccountId: properties.mortgageAccountId, escrowAccountId: properties.escrowAccountId })
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
    else byKey.set(lineKeyFor(r.catName), (byKey.get(lineKeyFor(r.catName)) ?? 0) + Math.abs(amt));
  }
  // Split parts (mortgage interest) → line 12.
  for (const s of splits) byKey.set('mortgage_interest', (byKey.get('mortgage_interest') ?? 0) + Math.abs(Number(s.amount)));

  const lines = LINE_DEFS.map((d) => ({ ...d, amount: round2(byKey.get(d.key) ?? 0) }));
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
