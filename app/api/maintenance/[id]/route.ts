/**
 * Update or delete a maintenance work order.
 *   PATCH  /api/maintenance/[id]
 *   DELETE /api/maintenance/[id]
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { maintenance } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { maintenanceSchema } from '@/lib/properties/maintenance-validation';

const patchSchema = maintenanceSchema.partial();

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = patchSchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['title', 'status', 'category', 'vendor', 'openedAt', 'completedAt', 'notes'] as const) {
    if (k in b) set[k] = (b as Record<string, unknown>)[k];
  }
  if ('cost' in b) set.cost = b.cost != null ? b.cost.toFixed(2) : null;

  const [updated] = await db.update(maintenance).set(set).where(eq(maintenance.id, id)).returning({ id: maintenance.id });
  if (!updated) return fail('not_found', 'Work order not found.', 404);
  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [deleted] = await db.delete(maintenance).where(eq(maintenance.id, id)).returning({ id: maintenance.id });
  if (!deleted) return fail('not_found', 'Work order not found.', 404);
  return ok({ id: deleted.id });
});
