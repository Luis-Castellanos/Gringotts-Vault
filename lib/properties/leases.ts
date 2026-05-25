/**
 * Lease / rent-roll loaders (Real Estate Phase 3). Per-property lease list +
 * a portfolio rent-roll roll-up (active-lease monthly rent by property).
 */

import { asc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { leases } from '@/lib/db/schema';

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export type LeaseRow = {
  id: string;
  propertyId: string;
  unit: string | null;
  tenantName: string | null;
  tenantContact: string | null;
  rentAmount: number | null;
  depositAmount: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  notes: string | null;
};

function toRow(r: typeof leases.$inferSelect): LeaseRow {
  return {
    id: r.id,
    propertyId: r.propertyId,
    unit: r.unit,
    tenantName: r.tenantName,
    tenantContact: r.tenantContact,
    rentAmount: num(r.rentAmount),
    depositAmount: num(r.depositAmount),
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    notes: r.notes,
  };
}

export async function loadLeases(propertyId: string): Promise<LeaseRow[]> {
  const rows = await db
    .select()
    .from(leases)
    .where(eq(leases.propertyId, propertyId))
    .orderBy(asc(leases.unit), asc(leases.startDate));
  return rows.map(toRow);
}

export type RentRoll = { monthlyRent: number; activeLeases: number };

/** Active-lease monthly rent + count, by property. */
export async function loadRentRoll(): Promise<Map<string, RentRoll>> {
  const rows = await db
    .select({
      propertyId: leases.propertyId,
      rent: sql<string>`COALESCE(SUM(${leases.rentAmount}), 0)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(leases)
    .where(eq(leases.status, 'active'))
    .groupBy(leases.propertyId);
  return new Map(rows.map((r) => [r.propertyId, { monthlyRent: Number(r.rent), activeLeases: r.n }]));
}

/** Portfolio total active monthly rent. */
export async function loadTotalMonthlyRent(): Promise<number> {
  const [row] = await db
    .select({ rent: sql<string>`COALESCE(SUM(${leases.rentAmount}), 0)::text` })
    .from(leases)
    .where(eq(leases.status, 'active'));
  return Number(row?.rent ?? 0);
}
