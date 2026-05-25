/**
 * Create a property (Real Estate page).
 *
 *   POST /api/properties
 *   Body: name (required) + optional address / specs / acquisition / value /
 *         mortgageAccountId.
 */

import { NextRequest } from 'next/server';

import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { propertySchema } from '@/lib/properties/validation';

/** List properties (id + name + whether a mortgage is linked) for pickers. */
export const GET = handler(async () => {
  const rows = await db
    .select({ id: properties.id, name: properties.name, mortgageAccountId: properties.mortgageAccountId })
    .from(properties)
    .orderBy(asc(properties.sortOrder), asc(properties.name));
  return ok(rows.map((r) => ({ id: r.id, name: r.name, hasMortgage: !!r.mortgageAccountId })));
});

export const POST = handler(async (req: NextRequest) => {
  const b = propertySchema.parse(await req.json());

  const [inserted] = await db
    .insert(properties)
    .values({
      name: b.name,
      street: b.street ?? null,
      city: b.city ?? null,
      state: b.state ?? null,
      zip: b.zip ?? null,
      propertyType: b.propertyType,
      beds: b.beds ?? null,
      baths: b.baths != null ? b.baths.toFixed(1) : null,
      sqft: b.sqft ?? null,
      acquisitionDate: b.acquisitionDate ?? null,
      acquisitionPrice: b.acquisitionPrice != null ? b.acquisitionPrice.toFixed(2) : null,
      landValuePct: b.landValuePct != null ? b.landValuePct.toFixed(2) : null,
      marketValue: b.marketValue != null ? b.marketValue.toFixed(2) : null,
      imageUrl: b.imageUrl ?? null,
      mortgageAccountId: b.mortgageAccountId ?? null,
      notes: b.notes ?? null,
    })
    .returning({ id: properties.id });

  if (!inserted) return fail('insert_failed', 'Could not create property.', 500);
  return ok({ id: inserted.id }, { status: 201 });
});
