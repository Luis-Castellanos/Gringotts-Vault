/**
 * Saved custom-report queries.
 *   GET  → SavedQuery[]
 *   POST { name, definition } → { id }
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { reportQueries } from '@/lib/db/schema';
import { handler, fail, ok } from '@/lib/api/respond';
import { loadSavedQueries } from '@/lib/reports/query';
import { queryDefSchema } from '@/lib/reports/query-validation';

export const runtime = 'nodejs';

export const GET = handler(async () => ok(await loadSavedQueries()));

const saveSchema = z.object({ name: z.string().min(1).max(120), definition: queryDefSchema });

export const POST = handler(async (req: NextRequest) => {
  const b = saveSchema.parse(await req.json());
  const [row] = await db.insert(reportQueries).values({ name: b.name.trim(), definition: b.definition }).returning({ id: reportQueries.id });
  if (!row) return fail('insert_failed', 'Could not save the report.', 500);
  return ok({ id: row.id }, { status: 201 });
});
