/**
 * Edit or remove an account type.
 *   PATCH  /api/account-types/[slug]   Body: { label?, group?, assetClass?, isArchived?, sortOrder? }
 *   DELETE /api/account-types/[slug]   (custom + unused only; built-ins must be archived)
 */

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accountTypes, accounts } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { TAXONOMY_TAG } from '@/lib/taxonomy-style';

const patchSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  group: z.enum(['banking', 'credit_loans', 'investments', 'retirement', 'property', 'other']).optional(),
  assetClass: z.enum(['asset', 'liability']).optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  icon: z.string().max(8).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const body = patchSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.group !== undefined) patch.groupKey = body.group;
  if (body.assetClass !== undefined) patch.assetClass = body.assetClass;
  if (body.isArchived !== undefined) patch.isArchived = body.isArchived;
  if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder;
  if (body.icon !== undefined) patch.icon = body.icon;
  if (body.color !== undefined) patch.color = body.color;
  if (Object.keys(patch).length === 0) return ok({ slug });

  const updated = await db.update(accountTypes).set(patch).where(eq(accountTypes.slug, slug)).returning();
  if (updated.length === 0) return fail('not_found', 'Account type not found.', 404);
  revalidateTag(TAXONOMY_TAG);
  return ok(updated[0]);
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;

  const [t] = await db.select().from(accountTypes).where(eq(accountTypes.slug, slug)).limit(1);
  if (!t) return fail('not_found', 'Account type not found.', 404);
  if (t.isBuiltin) return fail('builtin', 'Built-in types can’t be deleted — archive it instead.', 400);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(eq(accounts.type, slug));
  if (n > 0) {
    return fail('in_use', `${n} account${n === 1 ? '' : 's'} use this type. Reassign them first, or archive it.`, 409);
  }

  await db.delete(accountTypes).where(eq(accountTypes.slug, slug));
  revalidateTag(TAXONOMY_TAG);
  return ok({ slug });
});
