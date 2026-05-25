/** Capital-improvements loader (Real Estate Phase 6). */

import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { capex } from '@/lib/db/schema';

export type CapexRow = {
  id: string;
  propertyId: string;
  description: string;
  cost: number;
  placedInService: string | null;
  usefulLifeYears: number;
  notes: string | null;
};

export async function loadCapex(propertyId: string): Promise<CapexRow[]> {
  const rows = await db
    .select()
    .from(capex)
    .where(eq(capex.propertyId, propertyId))
    .orderBy(desc(capex.placedInService));
  return rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    description: r.description,
    cost: Number(r.cost),
    placedInService: r.placedInService,
    usefulLifeYears: r.usefulLifeYears,
    notes: r.notes,
  }));
}
