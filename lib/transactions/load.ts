/**
 * Shared transaction loader — used by the Transactions page (initial page) and
 * the GET /api/transactions endpoint (infinite-scroll pages), so the row shape
 * and ordering can't drift between them.
 */

import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import type { TxnRow } from '@/app/transactions/TransactionsClient';

export async function loadTransactions(limit: number, offset = 0): Promise<TxnRow[]> {
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
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
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
}

export async function countTransactions(): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(transactions);
  return n;
}
