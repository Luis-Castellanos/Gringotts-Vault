/**
 * GET /api/review/merchant-history/[merchantPrefix]?exclude=<txnId>
 *
 * Returns aggregate history for transactions matching the given merchant
 * prefix (ILIKE prefix || '%'). Used by the Review Queue's "Recent activity"
 * card. Pass `exclude` to omit the transaction currently being reviewed.
 *
 * Cadence is the median interval (in days) between consecutive transactions:
 *   25–35d → monthly, 5–9d → weekly, 350–380d → yearly, otherwise irregular.
 */

import { NextRequest } from 'next/server';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { handler, ok } from '@/lib/api/respond';

const querySchema = z.object({ exclude: z.string().uuid().optional() });

export const GET = handler(
  async (req: NextRequest, ctx: { params: Promise<{ merchantPrefix: string }> }) => {
    const { merchantPrefix: rawPrefix } = await ctx.params;
    const prefix = decodeURIComponent(rawPrefix);
    const { exclude } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));

    const rows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(
        sql`${transactions.rawDescription} ILIKE ${prefix + '%'}`,
        exclude ? ne(transactions.id, exclude) : undefined,
      ))
      .orderBy(asc(transactions.date));

    if (rows.length === 0) {
      return ok({
        totalCount: 0,
        totalAmount: 0,
        avgAmount: 0,
        cadence: 'irregular' as const,
        categories: [],
        lastFive: [],
      });
    }

    const totalCount = rows.length;
    const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
    const avgAmount = totalAmount / totalCount;

    let cadence: 'monthly' | 'weekly' | 'yearly' | 'irregular' = 'irregular';
    if (rows.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const d1 = new Date(rows[i - 1].date).getTime();
        const d2 = new Date(rows[i].date).getTime();
        intervals.push(Math.abs(d2 - d1) / 86400000);
      }
      intervals.sort((a, b) => a - b);
      const m = intervals.length;
      const median = m % 2 ? intervals[(m - 1) / 2] : (intervals[m / 2 - 1] + intervals[m / 2]) / 2;
      if (median >= 25 && median <= 35) cadence = 'monthly';
      else if (median >= 5 && median <= 9) cadence = 'weekly';
      else if (median >= 350 && median <= 380) cadence = 'yearly';
    }

    const catCounts = new Map<string, number>();
    for (const r of rows) {
      if (!r.categoryName) continue;
      catCounts.set(r.categoryName, (catCounts.get(r.categoryName) ?? 0) + 1);
    }
    const categoriesOut = [...catCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const lastFive = rows.slice(-5).reverse().map((r) => ({
      id: r.id,
      date: r.date,
      amount: r.amount,
      category: r.categoryName,
    }));

    return ok({ totalCount, totalAmount, avgAmount, cadence, categories: categoriesOut, lastFive });
  },
);
