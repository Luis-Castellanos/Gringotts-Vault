/**
 * Generic update for a single transaction.
 *
 *   PATCH /api/transactions/[id]
 *   Body: partial transaction fields
 *
 *   Special: when `merchant` is updated AND `applyMerchantToSimilar` is true,
 *   we ALSO update merchant on all matching uncategorized transactions (Option B
 *   of the merchant-edit pattern). Per design: only uncategorized.
 */

import { NextRequest } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { merchantPrefix } from '@/lib/transactions/merchant';

const bodySchema = z.object({
  merchant: z.string().optional(),
  accountId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isTransfer: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  applyMerchantToSimilar: z.boolean().optional(),
});

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!txn) return fail('not_found', 'Transaction not found.', 404);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.merchant !== undefined) patch.merchant = body.merchant;
    if (body.accountId !== undefined) patch.accountId = body.accountId;
    if (body.date !== undefined) patch.date = body.date;
    if (body.isTransfer !== undefined) patch.isTransfer = body.isTransfer;
    if (body.needsReview !== undefined) patch.needsReview = body.needsReview;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.propertyId !== undefined) patch.propertyId = body.propertyId;

    await db.update(transactions).set(patch).where(eq(transactions.id, id));

    const applied: { id: string }[] = [{ id }];

    // Bulk merchant rename — only touches uncategorized rows (per design)
    if (body.merchant !== undefined && body.applyMerchantToSimilar) {
      const prefix = merchantPrefix(txn.rawDescription);
      const others = await db
        .update(transactions)
        .set({ merchant: body.merchant, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.needsReview, true),
            ne(transactions.id, id),
            sql`${transactions.rawDescription} ILIKE ${prefix + '%'}`,
          ),
        )
        .returning({ id: transactions.id });
      applied.push(...others);
    }

    return ok({ updated: applied.length, applied });
  },
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const deleted = await db
      .delete(transactions)
      .where(eq(transactions.id, id))
      .returning({ id: transactions.id });
    if (deleted.length === 0) return fail('not_found', 'Transaction not found.', 404);
    return ok({ deleted: deleted.length });
  },
);
