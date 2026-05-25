/**
 * Per-property financials (Real Estate Phase 1). Aggregates the transactions
 * attributed to a property — by manual tag (`transactions.property_id`) OR by
 * sitting on the property's mortgage/escrow account (account-rollup) — into
 * income / expenses / net cash flow, with category + monthly breakdowns. Split
 * parents are excluded; their non-transfer parts (e.g. mortgage interest) are
 * folded back in. Transfers (principal/escrow legs) are excluded from P&L.
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { categories, transactions, transactionSplits } from '@/lib/db/schema';

export type FinCategory = { id: string; name: string; color: string | null; amount: number };
export type FinMonth = { ym: string; income: number; expenses: number; net: number };
export type PropertyFinancials = {
  income: number;
  expenses: number;
  net: number;
  incomeByCategory: FinCategory[];
  expenseByCategory: FinCategory[];
  months: FinMonth[];
  txnCount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadPropertyFinancials(
  propertyId: string,
  accountIds: string[], // the property's mortgage/escrow accounts (for rollup)
): Promise<PropertyFinancials> {
  // Attribution predicate: tagged to this property, or on a rolled-up account.
  const attributed = accountIds.length
    ? or(eq(transactions.propertyId, propertyId), inArray(transactions.accountId, accountIds))
    : eq(transactions.propertyId, propertyId);

  const parent = alias(transactions, 'split_parent_txn');

  const [regular, splits] = await Promise.all([
    // Regular (non-split-parent) attributed transactions, excluding transfers.
    db
      .select({
        date: transactions.date,
        amount: transactions.amount,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        catId: sql<string>`COALESCE(${categories.id}::text, 'uncat')`,
        catName: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        catColor: categories.color,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(attributed, eq(transactions.isSplit, false), eq(transactions.isTransfer, false))),
    // Non-transfer split parts whose parent is attributed (e.g. mortgage interest).
    db
      .select({
        date: parent.date,
        amount: transactionSplits.amount,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        catId: sql<string>`COALESCE(${categories.id}::text, 'uncat')`,
        catName: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        catColor: categories.color,
      })
      .from(transactionSplits)
      .innerJoin(parent, eq(transactionSplits.transactionId, parent.id))
      .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
      .where(
        and(
          eq(transactionSplits.isTransfer, false),
          accountIds.length
            ? or(eq(parent.propertyId, propertyId), inArray(parent.accountId, accountIds))
            : eq(parent.propertyId, propertyId),
        ),
      ),
  ]);

  const incomeMap = new Map<string, FinCategory>();
  const expenseMap = new Map<string, FinCategory>();
  const monthMap = new Map<string, FinMonth>();
  let income = 0;
  let expenses = 0;
  let txnCount = 0;

  const add = (map: Map<string, FinCategory>, id: string, name: string, color: string | null, amt: number) => {
    const e = map.get(id);
    if (e) e.amount = round2(e.amount + amt);
    else map.set(id, { id, name, color, amount: round2(amt) });
  };

  for (const r of [...regular, ...splits]) {
    txnCount += 1;
    const amt = Number(r.amount);
    const ym = r.date.slice(0, 7);
    const m = monthMap.get(ym) ?? { ym, income: 0, expenses: 0, net: 0 };
    if (r.flow === 'transfer') continue;
    if (r.flow === 'inflow') {
      income += amt;
      m.income += amt;
      if (amt !== 0) add(incomeMap, r.catId, r.catName, r.catColor, amt);
    } else {
      expenses += amt; // stored negative
      m.expenses += Math.abs(amt);
      if (Math.abs(amt) > 0) add(expenseMap, r.catId, r.catName, r.catColor, Math.abs(amt));
    }
    monthMap.set(ym, m);
  }

  for (const m of monthMap.values()) {
    m.income = round2(m.income);
    m.expenses = round2(m.expenses);
    m.net = round2(m.income - m.expenses);
  }

  income = round2(income);
  expenses = round2(Math.abs(expenses));
  return {
    income,
    expenses,
    net: round2(income - expenses),
    incomeByCategory: [...incomeMap.values()].sort((a, b) => b.amount - a.amount),
    expenseByCategory: [...expenseMap.values()].sort((a, b) => b.amount - a.amount),
    months: [...monthMap.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    txnCount,
  };
}
