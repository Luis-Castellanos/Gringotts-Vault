import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories } from '@/lib/db/schema';
import { TransactionsClient, type AcctLite, type CatLite } from './TransactionsClient';
import { countTransactions, loadMerchants, loadTransactions } from '@/lib/transactions/load';
import './transactions.css';

export const metadata = { title: 'Transactions · Vault' };
export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const parentCat = alias(categories, 'parent_cat');
  // All five reads are independent — fire them together so the page waits on
  // one round-trip's worth of latency, not five stacked end to end.
  const [txns, total, merchants, acctList, catList] = await Promise.all([
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
  ]);

  const acctLites: AcctLite[] = acctList.map((a) => ({ id: a.id, name: a.name, institution: a.institution ?? '' }));
  const catLites: CatLite[] = catList.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    parentId: c.parentId ?? null,
    parentName: c.parentName ?? null,
  }));

  return (
    <main className="transactions-page w-full max-w-[1600px] px-6 pt-6 pb-20">
      <TransactionsClient txns={txns} total={total} accounts={acctLites} categories={catLites} merchants={merchants} />
    </main>
  );
}
