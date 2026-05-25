/**
 * Schedule-E mapping editor data: every outflow category with its explicit
 * `schedule_e_line` (if any) and the effective line key (explicit → else the
 * keyword heuristic). Backs the mapping modal on the property Schedule E section.
 */

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { keywordLineKey } from './schedule-e-lines';

export type SEMappingRow = {
  id: string;
  fullName: string; // "Parent · Child" (or just the name for a top-level category)
  explicit: string | null; // categories.schedule_e_line
  keywordKey: string; // what the heuristic resolves to (shown as the "Auto" default)
};

export async function loadScheduleEMapping(): Promise<SEMappingRow[]> {
  const all = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      flow: categories.flowType,
      archived: categories.isArchived,
      explicit: categories.scheduleELine,
    })
    .from(categories)
    .where(eq(categories.isArchived, false))
    .orderBy(asc(categories.name));

  const nameById = new Map(all.map((c) => [c.id, c.name]));

  return all
    .filter((c) => c.flow === 'outflow')
    .map((c) => {
      const fullName = c.parentId && nameById.has(c.parentId) ? `${nameById.get(c.parentId)} · ${c.name}` : c.name;
      return { id: c.id, fullName, explicit: c.explicit, keywordKey: keywordLineKey(fullName) };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
