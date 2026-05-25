/**
 * Create a custom account type.
 *   POST /api/account-types   Body: { label, group, assetClass? }
 *
 * Slug is derived from the label (uniqued). Custom types default to asset.
 * Built-ins are seeded by scripts/migrate-account-types.ts, not here.
 */

import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accountTypes } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { slugify } from '@/lib/transactions/taxonomy';
import { TAXONOMY_TAG } from '@/lib/taxonomy-style';

const bodySchema = z.object({
  label: z.string().min(1).max(40),
  group: z.enum(['banking', 'credit_loans', 'investments', 'retirement', 'property', 'other']),
  assetClass: z.enum(['asset', 'liability']).default('asset'),
});

export const POST = handler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json());

  // Unique slug from the label.
  const base = slugify(body.label) || 'type';
  const existing = new Set((await db.select({ slug: accountTypes.slug }).from(accountTypes)).map((r) => r.slug));
  let slug = base;
  let i = 2;
  while (existing.has(slug)) slug = `${base}_${i++}`;

  const all = await db.select({ sortOrder: accountTypes.sortOrder }).from(accountTypes);
  const nextOrder = all.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(accountTypes)
    .values({ slug, label: body.label.trim(), groupKey: body.group, assetClass: body.assetClass, icon: '📁', sortOrder: nextOrder, isBuiltin: false })
    .returning();

  revalidateTag(TAXONOMY_TAG);
  return ok(row);
});
