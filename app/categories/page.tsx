import { asc, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { CategoriesClient, type CatNode } from './CategoriesClient';
import './categories.css';

export const metadata = { title: 'Categories · Vault' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      flowType: categories.flowType,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const counts = await db
    .select({ catId: transactions.categoryId, n: sql<number>`count(*)::int` })
    .from(transactions)
    .groupBy(transactions.categoryId);
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
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="categories-page w-full max-w-[1600px] px-12 pt-8 pb-24">
          <CategoriesClient nodes={nodes} />
        </main>
      </div>
    </div>
  );
}
