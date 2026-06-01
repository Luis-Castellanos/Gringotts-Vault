import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { TransactionsClient, type AcctLite, type CatLite } from './TransactionsClient';
import { countTransactions, loadMerchants, loadTransactions } from '@/lib/transactions/load';
import './transactions.css';

export const metadata = { title: 'Transactions · Vault' };
export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const parentCat = alias(categories, 'parent_cat');
  // Independent reads — fired together so the page waits on one round-trip's
  // worth of latency, not several stacked end to end. catUsage/acctUsage drive
  // "only offer filter options that exist in the data".
  const [txns, total, merchants, acctList, catList, catUsage, acctUsage] = await Promise.all([
    loadTransactions(null, 0), // preload all; rendered incrementally
    countTransactions(),
    loadMerchants(),
    db
      .select({ id: accounts.id, name: accounts.name, institution: accounts.institution })
      .from(accounts)
      .orderBy(asc(accounts.name)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        parentId: categories.parentId,
        parentName: parentCat.name,
      })
      .from(categories)
      .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
      .where(eq(categories.isArchived, false))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({ catId: transactions.categoryId }).from(transactions).groupBy(transactions.categoryId),
    db.select({ acctId: transactions.accountId }).from(transactions).groupBy(transactions.accountId),
  ]);

  const acctLites: AcctLite[] = acctList.map((a) => ({ id: a.id, name: a.name, institution: a.institution ?? '' }));
  const catLites: CatLite[] = catList.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    parentId: c.parentId ?? null,
    parentName: c.parentName ?? null,
  }));

  // A child category in use also implies its parent group is worth showing; the
  // client expands used children up to their parents when building the two-level list.
  const usedCategoryIds = catUsage.map((c) => c.catId).filter((id): id is string => id != null);
  const hasUncategorized = catUsage.some((c) => c.catId == null);
  const usedAccountIds = acctUsage.map((a) => a.acctId).filter((id): id is string => id != null);

  return (
    <PageShell variant="dense" className="transactions-page">
      <TransactionsClient
        txns={txns}
        total={total}
        accounts={acctLites}
        categories={catLites}
        merchants={merchants}
        usedCategoryIds={usedCategoryIds}
        hasUncategorized={hasUncategorized}
        usedAccountIds={usedAccountIds}
      />
    </PageShell>
  );
}
