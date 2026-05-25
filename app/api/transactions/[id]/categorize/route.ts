/**
 * Categorize a transaction.
 *
 *   POST /api/transactions/[id]/categorize
 *   Body: {
 *     categoryId: string;
 *     applyToSimilar?: boolean;  // when true, also categorize matching uncategorized txns
 *     isTransfer?: boolean;
 *     tags?: string[];
 *     notes?: string;
 *   }
 *
 * Per the design decision: applyToSimilar ONLY touches transactions where
 * needsReview = TRUE. We never silently overwrite an already-categorized txn.
 *
 * Returns: {
 *   data: {
 *     updated: number;          // total rows updated (1 + similar applied to)
 *     applied: { id: string }[];
 *   }
 * }
 */

import { NextRequest } from 'next/server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { transactions, categories, vendorRules } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { merchantPrefix } from '@/lib/transactions/merchant';

const bodySchema = z.object({
  categoryId: z.string().uuid(),
  applyToSimilar: z.boolean().default(false),
  isTransfer: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json());

  // Verify the category exists
  const [cat] = await db.select().from(categories).where(eq(categories.id, body.categoryId)).limit(1);
  if (!cat) return fail('not_found', 'Category not found.', 404);

  // Verify the transaction exists
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!txn) return fail('not_found', 'Transaction not found.', 404);

  // 1. Update the focused transaction
  await db
    .update(transactions)
    .set({
      categoryId: body.categoryId,
      needsReview: false,
      isTransfer: body.isTransfer ?? txn.isTransfer,
      tags: body.tags ?? txn.tags,
      notes: body.notes ?? txn.notes,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, id));

  // Teach the vendor map: this merchant now maps to this category (confirmed),
  // so future ingests of the same merchant auto-categorize.
  if (txn.merchant) {
    await db
      .insert(vendorRules)
      .values({ merchant: txn.merchant, categoryId: body.categoryId, source: 'confirmed', hitCount: 1 })
      .onConflictDoUpdate({
        target: vendorRules.merchant,
        set: { categoryId: body.categoryId, source: 'confirmed', hitCount: sql`${vendorRules.hitCount} + 1`, updatedAt: new Date() },
      });
  }

  const applied: { id: string }[] = [{ id }];

  // 2. Optionally apply to similar uncategorized transactions
  if (body.applyToSimilar) {
    const prefix = merchantPrefix(txn.rawDescription);

    const updated = await db
      .update(transactions)
      .set({
        categoryId: body.categoryId,
        needsReview: false,
        // is_transfer also propagates if specified — categorizing one credit-card
        // payment as a transfer probably means the others should be too.
        ...(body.isTransfer !== undefined ? { isTransfer: body.isTransfer } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.needsReview, true),
          ne(transactions.id, id),
          sql`${transactions.rawDescription} ILIKE ${prefix + '%'}`,
        ),
      )
      .returning({ id: transactions.id });

    applied.push(...updated);
  }

  return ok({ updated: applied.length, applied });
});
