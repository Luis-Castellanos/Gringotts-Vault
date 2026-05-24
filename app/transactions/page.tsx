import { asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { TransactionsClient, type TxnRow, type AcctLite, type CatLite } from './TransactionsClient';
import './transactions.css';

export const metadata = { title: 'Transactions · Vault' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;

export default async function TransactionsPage() {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
      rawDescription: transactions.rawDescription,
      isTransfer: transactions.isTransfer,
      needsReview: transactions.needsReview,
      notes: transactions.notes,
      accountId: accounts.id,
      accountName: accounts.name,
      accountInstitution: accounts.institution,
      accountNumber: accounts.accountNumber,
      accountType: accounts.type,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIsIncome: categories.isIncome,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(PAGE_SIZE);

  const txns: TxnRow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    merchant: r.merchant ?? r.rawDescription,
    rawDescription: r.rawDescription,
    isTransfer: r.isTransfer,
    needsReview: r.needsReview,
    notes: r.notes,
    accountId: r.accountId,
    accountName: r.accountName ?? '',
    accountInstitution: r.accountInstitution ?? '',
    accountLast4: r.accountNumber ?? '',
    accountType: r.accountType ?? null,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
    categoryIsIncome: r.categoryIsIncome ?? false,
  }));

  const acctList = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      institution: accounts.institution,
    })
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

  const acctLites: AcctLite[] = acctList.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution ?? '',
  }));
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
          <TransactionsClient
            txns={txns}
            accounts={acctLites}
            categories={catLites}
            pageSize={PAGE_SIZE}
          />
        </main>
      </div>
    </div>
  );
}
