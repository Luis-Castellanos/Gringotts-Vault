/**
 * GET /api/categories
 * Returns a flat list with parent info, ordered for the review-screen pills.
 *
 * Top-level (parent IS NULL) come first, then children grouped by parent.
 * The frontend can use this to show top-of-hierarchy pills with drilldown,
 * or just filter to leaf categories. We return everything; the UI decides.
 */

import { asc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import {
  CATEGORY_PALETTE,
  childSlug,
  parentSlug,
  type Flow,
} from '@/lib/transactions/taxonomy';

/** Find a free slug, appending -2, -3, … on collision. */
async function uniqueSlug(base: string): Promise<string> {
  let slug = base || 'category';
  let i = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [hit] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!hit) return slug;
    slug = `${base}-${i++}`;
  }
}

export const GET = handler(async () => {
  const parent = alias(categories, 'parent');

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      color: categories.color,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
      isIncome: categories.isIncome,
      isArchived: categories.isArchived,
      parent: {
        id: parent.id,
        name: parent.name,
        slug: parent.slug,
        color: parent.color,
      },
    })
    .from(categories)
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return ok(rows);
});

/**
 * POST /api/categories
 * Create a category (parent) or subcategory (child).
 * Body: { name, flowType?, parentId? }
 *   - With parentId: a child; flow_type + color inherited from the parent.
 *   - Without: a top-level category; flowType defaults to 'outflow'.
 */
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  flowType: z.enum(['inflow', 'outflow', 'transfer']).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const POST = handler(async (req: NextRequest) => {
  const body = createSchema.parse(await req.json());
  const parentId = body.parentId ?? null;

  let flow: Flow;
  let baseSlug: string;
  let color: string | null = null;

  if (parentId) {
    const [parent] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!parent) return fail('not_found', 'Parent category not found.', 404);
    if (parent.parentId) return fail('invalid_parent', 'Categories are only two levels deep.', 400);
    flow = parent.flowType as Flow;
    baseSlug = childSlug(flow, parent.name, body.name);
    color = parent.color;
  } else {
    flow = (body.flowType ?? 'outflow') as Flow;
    baseSlug = parentSlug(flow, body.name);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(categories)
      .where(isNull(categories.parentId));
    color = CATEGORY_PALETTE[n % CATEGORY_PALETTE.length];
  }

  const slug = await uniqueSlug(baseSlug);

  // sortOrder = max sibling + 1.
  const siblings = await db
    .select({ s: categories.sortOrder })
    .from(categories)
    .where(parentId ? eq(categories.parentId, parentId) : isNull(categories.parentId));
  const sortOrder = siblings.reduce((m, r) => Math.max(m, r.s), -1) + 1;

  const [row] = await db
    .insert(categories)
    .values({ name: body.name, slug, color, flowType: flow, parentId, sortOrder, isIncome: flow === 'inflow' })
    .returning({ id: categories.id });

  return ok({ id: row.id });
});
