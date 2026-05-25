/**
 * Create a capital improvement.
 *   POST /api/capex   Body: propertyId + description/cost/placedInService/usefulLifeYears
 */

import { NextRequest } from 'next/server';

import { db } from '@/lib/db/client';
import { capex } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { capexSchema } from '@/lib/properties/capex-validation';

export const POST = handler(async (req: NextRequest) => {
  const b = capexSchema.parse(await req.json());
  const [created] = await db
    .insert(capex)
    .values({
      propertyId: b.propertyId,
      description: b.description,
      cost: b.cost.toFixed(2),
      placedInService: b.placedInService ?? null,
      usefulLifeYears: b.usefulLifeYears,
      notes: b.notes ?? null,
    })
    .returning({ id: capex.id });
  if (!created) return fail('insert_failed', 'Could not create capital improvement.', 500);
  return ok({ id: created.id }, { status: 201 });
});
