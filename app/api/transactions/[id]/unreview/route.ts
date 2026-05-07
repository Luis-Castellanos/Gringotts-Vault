/**
 * POST /api/transactions/[id]/unreview
 * Marks a transaction as needs_review = true again (sends it back to the queue).
 * Optionally clears the category. Used by the "undo" affordance in the
 * Recently-reviewed rail card.
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const bodySchema = z.object({
  clearCategory: z.boolean().default(false),
});

export const POST = handler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!txn) return fail('not_found', 'Transaction not found.', 404);

    await db
      .update(transactions)
      .set({
        needsReview: true,
        ...(body.clearCategory ? { categoryId: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));

    return ok({ id });
  },
);