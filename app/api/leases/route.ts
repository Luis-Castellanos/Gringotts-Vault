/**
 * Create a lease (rent roll).
 *   POST /api/leases   Body: propertyId + unit/tenant/rent/term/status
 */

import { NextRequest } from 'next/server';

import { db } from '@/lib/db/client';
import { leases } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { leaseSchema } from '@/lib/properties/lease-validation';

const money = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));

export const POST = handler(async (req: NextRequest) => {
  const b = leaseSchema.parse(await req.json());
  const [created] = await db
    .insert(leases)
    .values({
      propertyId: b.propertyId,
      unit: b.unit ?? null,
      tenantName: b.tenantName ?? null,
      tenantContact: b.tenantContact ?? null,
      rentAmount: money(b.rentAmount),
      depositAmount: money(b.depositAmount),
      startDate: b.startDate ?? null,
      endDate: b.endDate ?? null,
      status: b.status,
      notes: b.notes ?? null,
    })
    .returning({ id: leases.id });
  if (!created) return fail('insert_failed', 'Could not create lease.', 500);
  return ok({ id: created.id }, { status: 201 });
});
