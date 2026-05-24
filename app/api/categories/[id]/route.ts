/**
 * PATCH  /api/categories/[id]  — rename; change flow_type (parents cascade to
 *                                children). Slug stays stable on rename.
 * DELETE /api/categories/[id]  — refuses if the category has subcategories or
 *                                transactions (reassign them first).
 */

import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  flowType: z.enum(['inflow', 'outflow', 'transfer']).optional(),
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());

  const [cat] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!cat) return fail('not_found', 'Category not found.', 404);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.flowType !== undefined) {
    patch.flowType = body.flowType;
    patch.isIncome = body.flowType === 'inflow';
  }
  if (Object.keys(patch).length > 0) {
    await db.update(categories).set(patch).where(eq(categories.id, id));
  }

  // A parent's flow_type cascades to its children so the bucket stays coherent.
  if (body.flowType !== undefined && cat.parentId === null) {
    await db
      .update(categories)
      .set({ flowType: body.flowType, isIncome: body.flowType === 'inflow' })
      .where(eq(categories.parentId, id));
  }

  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;

  const [cat] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!cat) return fail('not_found', 'Category not found.', 404);

  const [{ childCount }] = await db
    .select({ childCount: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.parentId, id));
  if (childCount > 0) {
    return fail('has_children', `This category has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. Delete or move them first.`, 409);
  }

  const [{ txnCount }] = await db
    .select({ txnCount: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.categoryId, id));
  if (txnCount > 0) {
    return fail('has_transactions', `This category has ${txnCount} transaction${txnCount === 1 ? '' : 's'}. Reassign them first.`, 409);
  }

  await db.delete(categories).where(eq(categories.id, id));
  return ok({ id });
});
