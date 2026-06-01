import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { loadSplitContributions } from '@/lib/transactions/split';
import { CashflowClient, type AcctLite, type CatAgg, type MerchAgg } from './CashflowClient';
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
      merchant: transactions.merchant,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    // Exclude split parents — their parts (interest as expense, principal/escrow
    // as transfers) carry the real categorization. The transfer destination legs
    // are normal rows and still show in the transfers section.
    .where(eq(transactions.isSplit, false));

  // Non-transfer split parts (e.g. mortgage interest) — folded back in so split
  // payments still contribute their real spend/income (the parent was excluded).
  const splitContribs = await loadSplitContributions();

  // Aggregate per (month, account, category) so the client can re-derive the
  // chart series + breakdown for any account selection without a round-trip.
  const catMap = new Map<string, CatAgg>();
  const merchMap = new Map<string, MerchAgg>();
  const acctNames = new Map<string, string>();

  for (const r of [...rows, ...splitContribs]) {
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

    // Parallel aggregation keyed by merchant, for the Merchant breakdown dimension.
    const merchant = (r.merchant ?? '').trim() || '(no merchant)';
    const mKey = `${ym}|${accountId}|${merchant}`;
    const mExisting = merchMap.get(mKey);
    if (mExisting) mExisting.signed += amt;
    else merchMap.set(mKey, { ym, flow, merchant, accountId, signed: amt });
  }

  const cats: CatAgg[] = [...catMap.values()].map((c) => ({ ...c, signed: round2(c.signed) }));
  const merchants: MerchAgg[] = [...merchMap.values()].map((m) => ({ ...m, signed: round2(m.signed) }));
  const accountsList: AcctLite[] = [...acctNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageShell variant="dashboard" className="cashflow-page">
      <CashflowClient cats={cats} merchants={merchants} accounts={accountsList} />
    </PageShell>
  );
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
