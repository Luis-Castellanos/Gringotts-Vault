/**
 * Update or delete a capital improvement.
 *   PATCH  /api/capex/[id]
 *   DELETE /api/capex/[id]
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { capex } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { capexSchema } from '@/lib/properties/capex-validation';

const patchSchema = capexSchema.partial();

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = patchSchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['description', 'placedInService', 'usefulLifeYears', 'notes'] as const) {
    if (k in b) set[k] = (b as Record<string, unknown>)[k];
  }
  if ('cost' in b && b.cost != null) set.cost = b.cost.toFixed(2);

  const [updated] = await db.update(capex).set(set).where(eq(capex.id, id)).returning({ id: capex.id });
  if (!updated) return fail('not_found', 'Item not found.', 404);
  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [deleted] = await db.delete(capex).where(eq(capex.id, id)).returning({ id: capex.id });
  if (!deleted) return fail('not_found', 'Item not found.', 404);
  return ok({ id: deleted.id });
});
