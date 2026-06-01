import { asc, sql } from 'drizzle-orm';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { CategoriesClient, type CatNode } from './CategoriesClient';
import './categories.css';

export const metadata = { title: 'Categories · Vault' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const [cats, counts] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        flowType: categories.flowType,
        parentId: categories.parentId,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ catId: transactions.categoryId, n: sql<number>`count(*)::int` })
      .from(transactions)
      .groupBy(transactions.categoryId),
  ]);
  const countById = new Map(counts.map((c) => [c.catId, c.n]));

  const nodes: CatNode[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    flowType: c.flowType,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    count: countById.get(c.id) ?? 0,
  }));

  return (
    <PageShell variant="form" className="categories-page">
      <CategoriesClient nodes={nodes} />
    </PageShell>
  );
}
