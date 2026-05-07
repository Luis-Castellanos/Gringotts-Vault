/**
 * Seeds the categories table with the hierarchy used by the Review Queue.
 *
 * Run after migrations:
 *   pnpm db:seed
 */

import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';

type Seed = {
  slug: string;
  name: string;
  color: string;
  isIncome?: boolean;
  sortOrder: number;
  parentSlug?: string;
};

const SEEDS: Seed[] = [
  // Income
  { slug: 'income', name: 'Income', color: '#10b981', isIncome: true, sortOrder: 0 },
  { slug: 'salary', name: 'Salary', color: '#10b981', isIncome: true, sortOrder: 1, parentSlug: 'income' },
  { slug: 'dividends', name: 'Dividends', color: '#3b82f6', isIncome: true, sortOrder: 2, parentSlug: 'income' },
  { slug: 'interest', name: 'Interest', color: '#6366f1', isIncome: true, sortOrder: 3, parentSlug: 'income' },
  { slug: 'cashback', name: 'Cashback', color: '#22c55e', isIncome: true, sortOrder: 4, parentSlug: 'income' },
  { slug: 'other_income', name: 'Other Income', color: '#84cc16', isIncome: true, sortOrder: 5, parentSlug: 'income' },

  // Spending parents
  { slug: 'food_dining', name: 'Food & Dining', color: '#f97316', sortOrder: 10 },
  { slug: 'shopping', name: 'Shopping', color: '#ec4899', sortOrder: 20 },
  { slug: 'subscriptions', name: 'Subscriptions & Software', color: '#a855f7', sortOrder: 30 },
  { slug: 'transportation', name: 'Transportation', color: '#06b6d4', sortOrder: 40 },
  { slug: 'housing', name: 'Housing', color: '#3b82f6', sortOrder: 50 },
  { slug: 'bills_utilities', name: 'Bills & Utilities', color: '#0ea5e9', sortOrder: 60 },
  { slug: 'health_wellness', name: 'Health & Wellness', color: '#ef4444', sortOrder: 70 },
  { slug: 'entertainment', name: 'Entertainment', color: '#d946ef', sortOrder: 80 },
  { slug: 'travel', name: 'Travel', color: '#14b8a6', sortOrder: 90 },
  { slug: 'financial', name: 'Financial', color: '#64748b', sortOrder: 100 },
  { slug: 'uncategorized', name: 'Uncategorized', color: '#71717a', sortOrder: 999 },

  // Food & Dining children
  { slug: 'restaurants', name: 'Restaurants', color: '#f97316', sortOrder: 1, parentSlug: 'food_dining' },
  { slug: 'fast_food', name: 'Fast Food', color: '#fb923c', sortOrder: 2, parentSlug: 'food_dining' },
  { slug: 'coffee_tea', name: 'Coffee & Tea', color: '#fdba74', sortOrder: 3, parentSlug: 'food_dining' },
  { slug: 'groceries', name: 'Groceries', color: '#84cc16', sortOrder: 4, parentSlug: 'food_dining' },
  { slug: 'delivery', name: 'Delivery', color: '#fcd34d', sortOrder: 5, parentSlug: 'food_dining' },

  // Shopping children
  { slug: 'general_merch', name: 'General Merchandise', color: '#ec4899', sortOrder: 1, parentSlug: 'shopping' },
  { slug: 'clothing', name: 'Clothing & Wearables', color: '#f472b6', sortOrder: 2, parentSlug: 'shopping' },
  { slug: 'online_shopping', name: 'Online Shopping', color: '#db2777', sortOrder: 3, parentSlug: 'shopping' },
  { slug: 'electronics', name: 'Electronics', color: '#be185d', sortOrder: 4, parentSlug: 'shopping' },

  // Subscriptions children
  { slug: 'software_saas', name: 'Software & SaaS', color: '#a855f7', sortOrder: 1, parentSlug: 'subscriptions' },
  { slug: 'news_media', name: 'News & Media', color: '#c084fc', sortOrder: 2, parentSlug: 'subscriptions' },
  { slug: 'streaming', name: 'Streaming', color: '#9333ea', sortOrder: 3, parentSlug: 'subscriptions' },

  // Transportation children
  { slug: 'fuel', name: 'Fuel', color: '#06b6d4', sortOrder: 1, parentSlug: 'transportation' },
  { slug: 'rideshare', name: 'Rideshare', color: '#22d3ee', sortOrder: 2, parentSlug: 'transportation' },
  { slug: 'public_transit', name: 'Public Transit', color: '#67e8f9', sortOrder: 3, parentSlug: 'transportation' },
  { slug: 'auto_maintenance', name: 'Auto Maintenance', color: '#0891b2', sortOrder: 4, parentSlug: 'transportation' },

  // Financial children
  { slug: 'credit_card_payment', name: 'Credit Card Payment', color: '#64748b', sortOrder: 1, parentSlug: 'financial' },
  { slug: 'transfer', name: 'Transfer', color: '#94a3b8', sortOrder: 2, parentSlug: 'financial' },
  { slug: 'fees', name: 'Fees', color: '#475569', sortOrder: 3, parentSlug: 'financial' },
  { slug: 'investment_buy', name: 'Investment Purchase', color: '#334155', sortOrder: 4, parentSlug: 'financial' },

  // Uncategorized children
  { slug: 'review', name: 'Review', color: '#71717a', sortOrder: 1, parentSlug: 'uncategorized' },
];

async function seed() {
  console.log('Seeding categories...');

  // Two passes: insert parents first, then children with parent_id resolved.
  const idsBySlug = new Map<string, string>();

  for (const s of SEEDS.filter((x) => !x.parentSlug)) {
    const existing = await db.select().from(categories).where(eq(categories.slug, s.slug));
    if (existing[0]) {
      idsBySlug.set(s.slug, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(categories)
      .values({
        slug: s.slug,
        name: s.name,
        color: s.color,
        isIncome: s.isIncome ?? false,
        sortOrder: s.sortOrder,
      })
      .returning({ id: categories.id });
    idsBySlug.set(s.slug, row.id);
  }

  for (const s of SEEDS.filter((x) => x.parentSlug)) {
    const existing = await db.select().from(categories).where(eq(categories.slug, s.slug));
    if (existing[0]) continue;
    const parentId = idsBySlug.get(s.parentSlug!);
    if (!parentId) {
      console.warn(`  ! parent ${s.parentSlug} not found for ${s.slug}, skipping`);
      continue;
    }
    await db.insert(categories).values({
      slug: s.slug,
      name: s.name,
      color: s.color,
      isIncome: s.isIncome ?? false,
      sortOrder: s.sortOrder,
      parentId,
    });
  }

  console.log(`Done. ${SEEDS.length} categories seeded.`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
