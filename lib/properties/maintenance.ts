/**
 * Maintenance / work-order loaders (Real Estate Phase 4). Per-property log,
 * ordered open-first then newest. Cost is the recorded estimate/actual.
 */

import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { maintenance } from '@/lib/db/schema';

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export type MaintenanceRow = {
  id: string;
  propertyId: string;
  title: string;
  status: string;
  category: string | null;
  vendor: string | null;
  cost: number | null;
  openedAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

export async function loadMaintenance(propertyId: string): Promise<MaintenanceRow[]> {
  const rows = await db
    .select()
    .from(maintenance)
    .where(eq(maintenance.propertyId, propertyId))
    .orderBy(sql`CASE WHEN ${maintenance.status} = 'done' THEN 1 ELSE 0 END`, desc(maintenance.openedAt));
  return rows.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    title: r.title,
    status: r.status,
    category: r.category,
    vendor: r.vendor,
    cost: num(r.cost),
    openedAt: r.openedAt,
    completedAt: r.completedAt,
    notes: r.notes,
  }));
}
