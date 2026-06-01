/**
 * Shared transaction loader — used by the Transactions page (initial page) and
 * the GET /api/transactions endpoint (filtered + infinite-scroll pages), so the
 * row shape, filtering and ordering can't drift between them.
 */

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { displayMerchantName } from '@/lib/transactions/merchant';
import type { TxnRow } from '@/app/transactions/TransactionsClient';

export type TxnSort = 'date-desc' | 'date-asc' | 'amount-high' | 'amount-low' | 'merchant';

const SORTS = new Set<TxnSort>(['date-desc', 'date-asc', 'amount-high', 'amount-low', 'merchant']);
export function parseSort(raw: string | null | undefined): TxnSort {
  return raw && SORTS.has(raw as TxnSort) ? (raw as TxnSort) : 'date-desc';
}

export const UNCATEGORIZED = '__uncategorized__';

export type TxnFilters = {
  search?: string;
  from?: string | null; // ISO date, inclusive
  to?: string | null; // ISO date, inclusive
  accountIds?: string[];
  categoryIds?: string[]; // may include UNCATEGORIZED sentinel
  merchants?: string[];
  amountMin?: number | null; // compared against abs(amount)
  amountMax?: number | null;
  amountType?: 'debit' | 'credit'; // debit = outflow (amount<0), credit = inflow (amount>0)
  hideTransfers?: boolean;
  needsReviewOnly?: boolean;
};

// All conditions reference columns on the `transactions` table itself (account
// and category ids live there too), so the count query needs no joins.
function buildConditions(f?: TxnFilters): (SQL | undefined)[] {
  const c: (SQL | undefined)[] = [];
  if (!f) return c;

  if (f.search?.trim()) {
    const like = `%${f.search.trim()}%`;
    c.push(or(ilike(transactions.merchant, like), ilike(transactions.rawDescription, like)));
  }
  if (f.from) c.push(gte(transactions.date, f.from));
  if (f.to) c.push(lte(transactions.date, f.to));
  if (f.accountIds?.length) c.push(inArray(transactions.accountId, f.accountIds));

  if (f.categoryIds?.length) {
    const wantUncat = f.categoryIds.includes(UNCATEGORIZED);
    const ids = f.categoryIds.filter((x) => x !== UNCATEGORIZED);
    if (wantUncat && ids.length) {
      c.push(or(inArray(transactions.categoryId, ids), isNull(transactions.categoryId)));
    } else if (wantUncat) {
      c.push(isNull(transactions.categoryId));
    } else if (ids.length) {
      c.push(inArray(transactions.categoryId, ids));
    }
  }

  if (f.merchants?.length) {
    const merchantLikes = f.merchants.flatMap((merchant) => {
      const like = `%${merchant}%`;
      return [ilike(transactions.merchant, like), ilike(transactions.rawDescription, like)];
    });
    c.push(or(...merchantLikes));
  }
  if (f.amountMin != null && !Number.isNaN(f.amountMin)) {
    c.push(sql`abs(${transactions.amount}) >= ${f.amountMin}`);
  }
  if (f.amountMax != null && !Number.isNaN(f.amountMax)) {
    c.push(sql`abs(${transactions.amount}) <= ${f.amountMax}`);
  }
  if (f.amountType === 'debit') c.push(sql`${transactions.amount} < 0`);
  else if (f.amountType === 'credit') c.push(sql`${transactions.amount} > 0`);
  if (f.hideTransfers) c.push(eq(transactions.isTransfer, false));
  if (f.needsReviewOnly) c.push(eq(transactions.needsReview, true));
  return c;
}

function orderFor(sort: TxnSort): SQL[] {
  switch (sort) {
    case 'date-asc':
      return [asc(transactions.date), asc(transactions.id)];
    case 'amount-high':
      return [desc(sql`abs(${transactions.amount})`), desc(transactions.id)];
    case 'amount-low':
      return [asc(sql`abs(${transactions.amount})`), desc(transactions.id)];
    case 'merchant':
      return [asc(transactions.merchant), desc(transactions.id)];
    case 'date-desc':
    default:
      return [desc(transactions.date), desc(transactions.id)];
  }
}

// limit === null loads every matching row (used by the Transactions page, which
// preloads the whole set and renders it incrementally client-side).
export async function loadTransactions(
  limit: number | null,
  offset = 0,
  filters?: TxnFilters,
  sort: TxnSort = 'date-desc',
): Promise<TxnRow[]> {
  const conds = buildConditions(filters);
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
      rawDescription: transactions.rawDescription,
      isTransfer: transactions.isTransfer,
      isSplit: transactions.isSplit,
      propertyId: transactions.propertyId,
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
    .where(and(...conds))
    .orderBy(...orderFor(sort))
    .limit(limit ?? 10_000_000)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    merchant: displayMerchantName(r.merchant ?? r.rawDescription),
    rawDescription: r.rawDescription,
    isTransfer: r.isTransfer,
    isSplit: r.isSplit,
    propertyId: r.propertyId,
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

export async function countTransactions(filters?: TxnFilters): Promise<number> {
  const conds = buildConditions(filters);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(...conds));
  return n;
}

/** Distinct merchant names across all transactions (for the filter picker). */
export async function loadMerchants(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ merchant: transactions.merchant })
    .from(transactions)
    .orderBy(asc(transactions.merchant));
  return [...new Set(rows.map((r) => r.merchant).filter((m): m is string => !!m).map(displayMerchantName))]
    .sort((a, b) => a.localeCompare(b));
}
