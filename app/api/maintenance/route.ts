/**
 * Create a maintenance work order.
 *   POST /api/maintenance   Body: propertyId + title/status/category/vendor/cost/dates
 */

import { NextRequest } from 'next/server';

import { db } from '@/lib/db/client';
import { maintenance } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { maintenanceSchema } from '@/lib/properties/maintenance-validation';

export const POST = handler(async (req: NextRequest) => {
  const b = maintenanceSchema.parse(await req.json());
  const [created] = await db
    .insert(maintenance)
    .values({
      propertyId: b.propertyId,
      title: b.title,
      status: b.status,
      category: b.category ?? null,
      vendor: b.vendor ?? null,
      cost: b.cost != null ? b.cost.toFixed(2) : null,
      openedAt: b.openedAt ?? null,
      completedAt: b.completedAt ?? null,
      notes: b.notes ?? null,
    })
    .returning({ id: maintenance.id });
  if (!created) return fail('insert_failed', 'Could not create work order.', 500);
  return ok({ id: created.id }, { status: 201 });
});
