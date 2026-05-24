import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import {
  CashflowClient,
  type CatAgg,
  type SeriesPoint,
} from './CashflowClient';
import './cashflow.css';

export const metadata = { title: 'Cashflow · Vault' };
export const dynamic = 'force-dynamic';

export default async function CashflowPage() {
  const parent = alias(categories, 'parent_cat');

  // Every non-transfer transaction, joined to its category + parent. Transfers
  // are excluded (isTransfer is kept in sync with flow_type='transfer' by the
  // loader); null-category rows fall through as outflow.
  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      flowType: categories.flowType,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
      parentId: categories.parentId,
      parentName: parent.name,
      parentColor: parent.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .where(eq(transactions.isTransfer, false));

  // ── Aggregate server-side into compact structures ──────────────────────
  const seriesMap = new Map<string, { income: number; expense: number }>();
  const catMap = new Map<string, CatAgg>();

  for (const r of rows) {
    if (r.flowType === 'transfer') continue; // belt-and-suspenders
    const ym = r.date.slice(0, 7); // 'YYYY-MM'
    const amt = Number(r.amount);
    const flow: 'inflow' | 'outflow' = r.flowType === 'inflow' ? 'inflow' : 'outflow';

    // Monthly series — store display-positive income + expense.
    const pt = seriesMap.get(ym) ?? { income: 0, expense: 0 };
    if (flow === 'inflow') pt.income += amt;
    else pt.expense += -amt; // outflows are negative; negate to positive spend
    seriesMap.set(ym, pt);

    // Per-(month, category) rollup with parent (group) identity.
    const catId = r.catId ?? 'uncategorized';
    const catName = r.catName ?? 'Uncategorized';
    const groupId = r.parentId ?? r.catId ?? 'uncategorized';
    const groupName = r.parentId ? (r.parentName ?? catName) : catName;
    const groupColor = r.parentId ? (r.parentColor ?? null) : (r.catColor ?? null);

    const key = `${ym}|${catId}`;
    const existing = catMap.get(key);
    if (existing) {
      existing.signed += amt;
    } else {
      catMap.set(key, {
        ym,
        flow,
        catId,
        catName,
        catColor: r.catColor ?? null,
        groupId,
        groupName,
        groupColor,
        signed: amt,
      });
    }
  }

  // Debt paydown = net change in liability-account balances per month (sum of
  // signed transactions on credit cards + loans, transfers included). Positive =
  // debt reduced.
  const liabRows = await db
    .select({ date: transactions.date, amount: transactions.amount })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.assetClass, 'liability'));
  const debtByYm = new Map<string, number>();
  for (const r of liabRows) {
    const ym = r.date.slice(0, 7);
    debtByYm.set(ym, (debtByYm.get(ym) ?? 0) + Number(r.amount));
  }

  const allYms = new Set<string>([...seriesMap.keys(), ...debtByYm.keys()]);
  const series: SeriesPoint[] = [...allYms]
    .map((ym) => ({
      ym,
      income: round2(seriesMap.get(ym)?.income ?? 0),
      expense: round2(seriesMap.get(ym)?.expense ?? 0),
      debtPaydown: round2(debtByYm.get(ym) ?? 0),
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const cats: CatAgg[] = [...catMap.values()].map((c) => ({ ...c, signed: round2(c.signed) }));

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="cashflow-page w-full max-w-[1400px] px-10 pt-9 pb-20">
          <CashflowClient series={series} cats={cats} />
        </main>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
