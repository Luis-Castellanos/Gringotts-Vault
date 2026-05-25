/**
 * Edit a top-level account-type group (label / color / order).
 *   PATCH /api/account-type-groups/[key]   Body: { label?, color?, sortOrder? }
 * Groups are a fixed built-in set — only their presentation is editable.
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accountTypeGroups } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const patchSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ key: string }> }) => {
  const { key } = await ctx.params;
  const body = patchSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.color !== undefined) patch.color = body.color;
  if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
  if (Object.keys(patch).length === 0) return ok({ key });

  const updated = await db.update(accountTypeGroups).set(patch).where(eq(accountTypeGroups.key, key)).returning();
  if (updated.length === 0) return fail('not_found', 'Group not found.', 404);
  return ok(updated[0]);
});
