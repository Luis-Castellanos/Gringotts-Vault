/**
 * Read-only sanity check for the Cashflow data: prints the last 6 months of
 * income / expense / net and the top expense categories for the latest month.
 * Independent of the page code, so it cross-checks the aggregation.
 *
 *   npx tsx scripts/cashflow-sanity.ts
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';

async function main() {
  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      flowType: categories.flowType,
      catName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.isTransfer, false));

  const months = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    if (r.flowType === 'transfer') continue;
    const ym = r.date.slice(0, 7);
    const amt = Number(r.amount);
    const m = months.get(ym) ?? { income: 0, expense: 0 };
    if (r.flowType === 'inflow') m.income += amt;
    else m.expense += -amt;
    months.set(ym, m);
  }

  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`Non-transfer rows: ${rows.length} across ${sorted.length} months\n`);
  console.log('Month     Income      Expense     Net');
  for (const [ym, m] of sorted.slice(-6)) {
    const net = m.income - m.expense;
    console.log(
      `${ym}   ${m.income.toFixed(0).padStart(9)}   ${m.expense.toFixed(0).padStart(9)}   ${net.toFixed(0).padStart(9)}`,
    );
  }

  const latest = sorted[sorted.length - 1]?.[0];
  if (latest) {
    const cats = new Map<string, number>();
    for (const r of rows) {
      if (r.flowType !== 'outflow') continue;
      if (r.date.slice(0, 7) !== latest) continue;
      cats.set(r.catName ?? 'Uncategorized', (cats.get(r.catName ?? 'Uncategorized') ?? 0) + -Number(r.amount));
    }
    console.log(`\nTop expense categories for ${latest}:`);
    for (const [name, amt] of [...cats].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${amt.toFixed(2).padStart(10)}  ${name}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
