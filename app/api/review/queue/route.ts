/**
 * Review Queue API.
 *
 *   GET /api/review/queue
 *     Returns the next transaction that needs review, plus context:
 *       - the transaction itself (with account info)
 *       - count of remaining transactions in the queue
 *       - similar transactions (same merchant pattern), already categorized
 *       - suggested category (most-common category among similar txns)
 *
 *   Query params:
 *     skip   — comma-separated list of transaction IDs to exclude (already
 *              skipped this session)
 *     limit  — how many similar transactions to return (default 25)
 *
 * Shape returned:
 *   {
 *     data: {
 *       remaining: number;
 *       transaction: ReviewTransaction | null;   // null when queue empty
 *       similar: SimilarTransaction[];
 *       suggestedCategory: { id: string; name: string; slug: string } | null;
 *     }
 *   }
 */

import { NextRequest } from 'next/server';
import { and, asc, eq, inArray, isNotNull, ne, not, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { handler, ok } from '@/lib/api/respond';
import { merchantPrefix } from '@/lib/transactions/merchant';

const querySchema = z.object({
  skip: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const GET = handler(async (req: NextRequest) => {
  const params = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const skipIds = params.skip ? params.skip.split(',').filter(Boolean) : [];

  // 1. Count remaining
  const [{ count: remainingRaw }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.needsReview, true),
        skipIds.length ? not(inArray(transactions.id, skipIds)) : undefined,
      ),
    );
  const remaining = Number(remainingRaw);

  if (remaining === 0) {
    return ok({ remaining: 0, transaction: null, similar: [], suggestedCategory: null });
  }

  // 2. Pick the next one — oldest first feels right (work through the backlog)
  const next = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
      rawDescription: transactions.rawDescription,
      statementPeriod: transactions.statementPeriod,
      isTransfer: transactions.isTransfer,
      tags: transactions.tags,
      notes: transactions.notes,
      account: {
        id: accounts.id,
        displayName: accounts.displayName,
        color: accounts.color,
        type: accounts.type,
      },
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        eq(transactions.needsReview, true),
        skipIds.length ? not(inArray(transactions.id, skipIds)) : undefined,
      ),
    )
    .orderBy(asc(transactions.date))
    .limit(1);

  const txn = next[0];
  if (!txn) {
    return ok({ remaining, transaction: null, similar: [], suggestedCategory: null });
  }

  // 3. Find similar transactions by merchant prefix.
  //    Matches the leading word(s) of raw_description so that "PAPA JOHNS #4558"
  //    also matches "PAPA JOHNS #1234" and "PAPA JOHNS DELIVERY".
  const prefix = merchantPrefix(txn.rawDescription);

  const similar = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      merchant: transactions.merchant,
      rawDescription: transactions.rawDescription,
      needsReview: transactions.needsReview,
      category: {
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        color: categories.color,
      },
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        ne(transactions.id, txn.id),
        sql`${transactions.rawDescription} ILIKE ${prefix + '%'}`,
      ),
    )
    .orderBy(sql`${transactions.date} desc`)
    .limit(params.limit);

  // 4. Suggested category = most common category among already-categorized similars.
  const categorized = similar.filter((s) => s.category && !s.needsReview);
  const counts = new Map<string, { count: number; cat: NonNullable<typeof similar[number]['category']> }>();
  for (const s of categorized) {
    if (!s.category) continue;
    const existing = counts.get(s.category.id);
    if (existing) existing.count++;
    else counts.set(s.category.id, { count: 1, cat: s.category });
  }
  const suggestion = [...counts.values()].sort((a, b) => b.count - a.count)[0];
  const suggestedCategory = suggestion
    ? {
        id: suggestion.cat.id,
        name: suggestion.cat.name,
        slug: suggestion.cat.slug,
        color: suggestion.cat.color,
        confidence: suggestion.count / Math.max(categorized.length, 1),
        basedOn: suggestion.count,
      }
    : null;

  return ok({
    remaining,
    transaction: txn,
    similar,
    suggestedCategory,
    merchantPrefix: prefix,
  });
});
