/**
 * Schedule-E category→line mapping editor.
 *   GET   → { lines, rows }              (line options + every outflow category)
 *   PATCH → { categoryId, line|null }    (set/clear a category's explicit line)
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { handler, fail, ok } from '@/lib/api/respond';
import { loadScheduleEMapping } from '@/lib/properties/schedule-e-mapping';
import { SE_KEYS, SE_LINE_DEFS } from '@/lib/properties/schedule-e-lines';

export const runtime = 'nodejs';

export const GET = handler(async () => {
  const rows = await loadScheduleEMapping();
  return ok({ lines: SE_LINE_DEFS, rows });
});

const patchSchema = z.object({
  categoryId: z.string().uuid(),
  line: z.string().nullable(),
});

export const PATCH = handler(async (req: NextRequest) => {
  const { categoryId, line } = patchSchema.parse(await req.json());
  if (line != null && !SE_KEYS.has(line)) return fail('bad_line', 'Unknown Schedule E line.', 400);
  await db.update(categories).set({ scheduleELine: line }).where(eq(categories.id, categoryId));
  return ok({ ok: true });
});
