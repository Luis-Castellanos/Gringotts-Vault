/**
 * Delete a saved custom-report query.
 *   DELETE /api/reports/queries/[id]
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { reportQueries } from '@/lib/db/schema';
import { handler, ok } from '@/lib/api/respond';

export const runtime = 'nodejs';

export const DELETE = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await db.delete(reportQueries).where(eq(reportQueries.id, id));
  return ok({ ok: true });
});
