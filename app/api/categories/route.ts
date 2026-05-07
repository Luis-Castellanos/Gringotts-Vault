/**
 * GET /api/categories
 * Returns a flat list with parent info, ordered for the review-screen pills.
 *
 * Top-level (parent IS NULL) come first, then children grouped by parent.
 * The frontend can use this to show top-of-hierarchy pills with drilldown,
 * or just filter to leaf categories. We return everything; the UI decides.
 */

import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { handler, ok } from '@/lib/api/respond';

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
