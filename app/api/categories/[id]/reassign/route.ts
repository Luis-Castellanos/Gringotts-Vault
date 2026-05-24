/**
 * POST /api/categories/[id]/reassign
 * Move every transaction from this category to another one ("switch them all
 * over to a specific cat"), then optionally delete the now-empty source.
 *
 * Body: { targetId: string; deleteAfter?: boolean }
 *
 * Moved transactions inherit the target's transfer status (isTransfer follows
 * the target's flow_type) so the reporting filters stay correct.
 */

import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const bodySchema = z.object({
  targetId: z.string().uuid(),
  deleteAfter: z.boolean().default(false),
});

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json());

  if (body.targetId === id) return fail('invalid_target', 'Pick a different target category.', 400);

  const [src] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!src) return fail('not_found', 'Source category not found.', 404);
  const [tgt] = await db.select().from(categories).where(eq(categories.id, body.targetId)).limit(1);
  if (!tgt) return fail('not_found', 'Target category not found.', 404);

  const moved = await db
    .update(transactions)
    .set({ categoryId: body.targetId, isTransfer: tgt.flowType === 'transfer', updatedAt: new Date() })
    .where(eq(transactions.categoryId, id))
    .returning({ id: transactions.id });

  let deleted = false;
  if (body.deleteAfter) {
    const [{ childCount }] = await db
      .select({ childCount: sql<number>`count(*)::int` })
      .from(categories)
      .where(eq(categories.parentId, id));
    if (childCount === 0) {
      await db.delete(categories).where(eq(categories.id, id));
      deleted = true;
    }
  }

  return ok({ moved: moved.length, deleted });
});
