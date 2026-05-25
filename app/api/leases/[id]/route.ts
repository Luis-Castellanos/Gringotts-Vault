/**
 * Update or delete a lease.
 *   PATCH  /api/leases/[id]
 *   DELETE /api/leases/[id]
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { leases } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { leaseSchema } from '@/lib/properties/lease-validation';

const patchSchema = leaseSchema.partial();
const money = (n: number) => n.toFixed(2);

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = patchSchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ['unit', 'tenantName', 'tenantContact', 'startDate', 'endDate', 'status', 'notes'] as const) {
    if (k in b) set[k] = (b as Record<string, unknown>)[k];
  }
  if ('rentAmount' in b) set.rentAmount = b.rentAmount != null ? money(b.rentAmount) : null;
  if ('depositAmount' in b) set.depositAmount = b.depositAmount != null ? money(b.depositAmount) : null;

  const [updated] = await db.update(leases).set(set).where(eq(leases.id, id)).returning({ id: leases.id });
  if (!updated) return fail('not_found', 'Lease not found.', 404);
  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [deleted] = await db.delete(leases).where(eq(leases.id, id)).returning({ id: leases.id });
  if (!deleted) return fail('not_found', 'Lease not found.', 404);
  return ok({ id: deleted.id });
});
