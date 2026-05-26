/**
 * Restore the default category taxonomy (Settings → Restore default categories).
 *   POST { confirm: true } → re-seed defaults + remove custom categories.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, handler, ok } from '@/lib/api/respond';
import { restoreCategoryTaxonomy } from '@/lib/categories/seed';

export const runtime = 'nodejs';

const schema = z.object({ confirm: z.boolean() });

export const POST = handler(async (req: NextRequest) => {
  const { confirm } = schema.parse(await req.json());
  if (!confirm) return fail('not_confirmed', 'Not confirmed.', 400);
  const result = await restoreCategoryTaxonomy();
  return ok(result);
});
