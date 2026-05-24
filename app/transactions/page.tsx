import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { TransactionsClient, type AcctLite, type CatLite } from './TransactionsClient';
import { countTransactions, loadTransactions } from '@/lib/transactions/load';
import './transactions.css';

export const metadata = { title: 'Transactions · Vault' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;

export default async function TransactionsPage() {
  const txns = await loadTransactions(PAGE_SIZE, 0);
  const total = await countTransactions();

  const acctList = await db
    .select({ id: accounts.id, name: accounts.name, institution: accounts.institution })
    .from(accounts)
    .orderBy(asc(accounts.name));

  const parentCat = alias(categories, 'parent_cat');
  const catList = await db
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
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const acctLites: AcctLite[] = acctList.map((a) => ({ id: a.id, name: a.name, institution: a.institution ?? '' }));
  const catLites: CatLite[] = catList.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    parentId: c.parentId ?? null,
    parentName: c.parentName ?? null,
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="transactions-page w-full max-w-[1600px] px-12 pt-10 pb-20">
          <TransactionsClient txns={txns} total={total} accounts={acctLites} categories={catLites} pageSize={PAGE_SIZE} />
        </main>
      </div>
    </div>
  );
}
