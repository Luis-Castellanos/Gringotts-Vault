/**
 * Update or delete a goal.
 *   PATCH  /api/goals/[id]   — partial fields + optional accountIds (replaces links)
 *   DELETE /api/goals/[id]   — remove (cascades goal_accounts)
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { goalAccounts, goals } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { goalSchema } from '@/lib/goals/validation';

const money = (n: number) => n.toFixed(2);

const patchSchema = goalSchema.partial().extend({
  sortOrder: z.number().int().optional(),
  isArchived: z.boolean().optional(),
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = patchSchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['name', 'type', 'targetDate', 'icon', 'color', 'sortOrder', 'isArchived'] as const) {
    if (k in b) set[k] = (b as Record<string, unknown>)[k];
  }
  if ('targetAmount' in b) set.targetAmount = b.targetAmount != null ? money(b.targetAmount) : null;
  if ('monthlyContribution' in b) set.monthlyContribution = b.monthlyContribution != null ? money(b.monthlyContribution) : null;

  const [updated] = await db.update(goals).set(set).where(eq(goals.id, id)).returning({ id: goals.id });
  if (!updated) return fail('not_found', 'Goal not found.', 404);

  // Replace assigned accounts when accountIds is provided.
  if (b.accountIds) {
    await db.delete(goalAccounts).where(eq(goalAccounts.goalId, id));
    if (b.accountIds.length) {
      await db.insert(goalAccounts).values(b.accountIds.map((accountId) => ({ goalId: id, accountId })));
    }
  }
  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [deleted] = await db.delete(goals).where(eq(goals.id, id)).returning({ id: goals.id });
  if (!deleted) return fail('not_found', 'Goal not found.', 404);
  return ok({ id: deleted.id });
});
