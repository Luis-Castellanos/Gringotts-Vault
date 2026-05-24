/**
 * Bulk-edit transactions.
 *
 *   POST /api/transactions/bulk
 *   Body: {
 *     ids: string[];                 // transactions to update (1..2000)
 *     categoryId?: string | null;    // set category (null = uncategorize)
 *     isTransfer?: boolean;          // mark / unmark transfer
 *     needsReview?: boolean;         // send to / clear from the review queue
 *   }
 *
 * Only the provided fields are changed. Setting a (non-null) category implies
 * the rows have been reviewed — mirroring the single-transaction categorize —
 * unless needsReview is set explicitly in the same request.
 *
 * Returns: { data: { updated: number } }
 */

import { NextRequest } from 'next/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(2000),
  categoryId: z.string().uuid().nullable().optional(),
  isTransfer: z.boolean().optional(),
  needsReview: z.boolean().optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.categoryId !== undefined) {
    set.categoryId = body.categoryId;
    if (body.needsReview === undefined && body.categoryId !== null) set.needsReview = false;
  }
  if (body.isTransfer !== undefined) set.isTransfer = body.isTransfer;
  if (body.needsReview !== undefined) set.needsReview = body.needsReview;

  if (Object.keys(set).length === 1) return fail('bad_request', 'No changes specified.', 400);

  const updated = await db
    .update(transactions)
    .set(set)
    .where(inArray(transactions.id, body.ids))
    .returning({ id: transactions.id });

  return ok({ updated: updated.length });
});
