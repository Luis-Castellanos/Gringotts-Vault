/**
 * Update or delete a property.
 *
 *   PATCH  /api/properties/[id]   — partial update of any property field
 *   DELETE /api/properties/[id]   — remove the property (the linked mortgage
 *                                   account is untouched)
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { propertySchema } from '@/lib/properties/validation';

const patchSchema = propertySchema.partial().extend({
  isActive: z.boolean().optional(),
  soldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  soldPrice: z.number().nonnegative().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const money = (n: number) => n.toFixed(2);

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = patchSchema.parse(await req.json());

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const passthrough = ['name', 'street', 'city', 'state', 'zip', 'propertyType', 'imageUrl', 'notes', 'acquisitionDate', 'mortgageAccountId', 'isActive', 'soldDate', 'sortOrder'] as const;
  for (const k of passthrough) if (k in b) set[k] = (b as Record<string, unknown>)[k];
  if ('beds' in b) set.beds = b.beds ?? null;
  if ('sqft' in b) set.sqft = b.sqft ?? null;
  if ('baths' in b) set.baths = b.baths != null ? b.baths.toFixed(1) : null;
  if ('acquisitionPrice' in b) set.acquisitionPrice = b.acquisitionPrice != null ? money(b.acquisitionPrice) : null;
  if ('marketValue' in b) set.marketValue = b.marketValue != null ? money(b.marketValue) : null;
  if ('soldPrice' in b) set.soldPrice = b.soldPrice != null ? money(b.soldPrice) : null;

  const [updated] = await db.update(properties).set(set).where(eq(properties.id, id)).returning({ id: properties.id });
  if (!updated) return fail('not_found', 'Property not found.', 404);
  return ok({ id: updated.id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const [deleted] = await db.delete(properties).where(eq(properties.id, id)).returning({ id: properties.id });
  if (!deleted) return fail('not_found', 'Property not found.', 404);
  return ok({ id: deleted.id });
});
