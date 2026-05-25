/**
 * Persist a drag reorder of account types.
 *   POST /api/account-types/reorder   Body: { slugs: string[] }
 * Sets sort_order = index for each slug (the others keep their order).
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accountTypes } from '@/lib/db/schema';
import { handler, ok } from '@/lib/api/respond';

const bodySchema = z.object({ slugs: z.array(z.string()).max(200) });

export const POST = handler(async (req: NextRequest) => {
  const { slugs } = bodySchema.parse(await req.json());
  for (let i = 0; i < slugs.length; i++) {
    await db.update(accountTypes).set({ sortOrder: i }).where(eq(accountTypes.slug, slugs[i]!));
  }
  return ok({ count: slugs.length });
});
