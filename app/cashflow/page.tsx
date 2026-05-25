import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { CashflowClient, type AcctLite, type CatAgg } from './CashflowClient';
import './cashflow.css';

export const metadata = { title: 'Cashflow · Vault' };
export const dynamic = 'force-dynamic';

export default async function CashflowPage() {
  const parent = alias(categories, 'parent_cat');

  // Every transaction, joined to its category (+ parent group) and account.
  // Transfers are included now (they get their own breakdown section); the
  // category's flow_type decides the bucket. A null category falls through as
  // an outflow. Net savings already nets debt paydown out via the taxonomy
  // (a card payment is a transfer, the swipe was the outflow), so there's no
  // separate liability-balance pass anymore.
  const rows = await db
    .select({
      date: transactions.date,
      amount: transactions.amount,
      isTransfer: transactions.isTransfer,
      flowType: categories.flowType,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
      parentId: categories.parentId,
      parentName: parent.name,
      parentColor: parent.color,
      accountId: transactions.accountId,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id));

  // Aggregate per (month, account, category) so the client can re-derive the
  // chart series + breakdown for any account selection without a round-trip.
  const catMap = new Map<string, CatAgg>();
  const acctNames = new Map<string, string>();

  for (const r of rows) {
    const ym = r.date.slice(0, 7); // 'YYYY-MM'
    const amt = Number(r.amount);
    const flow: 'inflow' | 'outflow' | 'transfer' =
      r.flowType === 'transfer' || r.isTransfer
        ? 'transfer'
        : r.flowType === 'inflow'
          ? 'inflow'
          : 'outflow';

    const catId = r.catId ?? 'uncategorized';
    const catName = r.catName ?? 'Uncategorized';
    const groupId = r.parentId ?? r.catId ?? 'uncategorized';
    const groupName = r.parentId ? (r.parentName ?? catName) : catName;
    const groupColor = r.parentId ? (r.parentColor ?? null) : (r.catColor ?? null);
    const accountId = r.accountId ?? 'unknown';
    const accountName = r.accountName ?? 'Unknown account';
    if (r.accountId) acctNames.set(r.accountId, accountName);

    const key = `${ym}|${accountId}|${catId}`;
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
        accountId,
        accountName,
        signed: amt,
      });
    }
  }

  const cats: CatAgg[] = [...catMap.values()].map((c) => ({ ...c, signed: round2(c.signed) }));
  const accountsList: AcctLite[] = [...acctNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="cashflow-page w-full max-w-[1400px] px-10 pt-9 pb-20">
          <CashflowClient cats={cats} accounts={accountsList} />
        </main>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
