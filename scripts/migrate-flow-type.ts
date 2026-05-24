/**
 * One-shot, idempotent migration + classification for category flow_type.
 *
 *   1. Creates the `flow_type` enum and adds categories.flow_type (NOT NULL,
 *      default 'outflow') if they don't already exist. Safe to re-run.
 *   2. Classifies every category into inflow / outflow / transfer per the
 *      ROADMAP flow-type taxonomy.
 *
 * We do the DDL here (rather than `drizzle-kit push`) so it runs non-interactively
 * against Neon and is fully idempotent. schema.ts is kept in sync so the ORM
 * types match; a later `db:push` should report no diff.
 *
 * Usage:
 *   npx tsx scripts/migrate-flow-type.ts
 */

import 'dotenv/config';
import { inArray, notInArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';

// inflow — income you receive.
const INFLOW = ['income', 'salary', 'dividends', 'interest', 'other_income'];

// transfer — money moving between your own accounts; excluded from spend/income.
// investment_buy is a transfer (funding an asset you own), not spending.
const TRANSFER = ['transfer', 'credit_card_payment', 'investment_buy'];

// Everything else is outflow. Notably `cashback` is outflow per the ROADMAP
// (price reduction that nets against spending), even though the seed currently
// files it under Income with is_income = true — flagged for later reconciliation.

// The full seed taxonomy — anything in the DB outside this set will be warned
// about (it silently falls through to 'outflow').
const KNOWN_SLUGS = new Set([
  'income', 'salary', 'dividends', 'interest', 'cashback', 'other_income',
  'food_dining', 'shopping', 'subscriptions', 'transportation', 'housing',
  'bills_utilities', 'health_wellness', 'entertainment', 'travel', 'financial',
  'uncategorized', 'restaurants', 'fast_food', 'coffee_tea', 'groceries',
  'delivery', 'general_merch', 'clothing', 'online_shopping', 'electronics',
  'software_saas', 'news_media', 'streaming', 'fuel', 'rideshare',
  'public_transit', 'auto_maintenance', 'credit_card_payment', 'transfer',
  'fees', 'investment_buy', 'review',
]);

async function main() {
  console.log('1/3  Ensuring flow_type enum + column exist...');
  await db.execute(
    sql.raw(
      `DO $$ BEGIN
         CREATE TYPE flow_type AS ENUM ('inflow', 'outflow', 'transfer');
       EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    ),
  );
  await db.execute(
    sql.raw(
      `ALTER TABLE categories
         ADD COLUMN IF NOT EXISTS flow_type flow_type NOT NULL DEFAULT 'outflow';`,
    ),
  );

  console.log('2/3  Classifying categories...');
  const all = await db.select({ slug: categories.slug }).from(categories);
  const unknown = all.map((r) => r.slug).filter((s) => !KNOWN_SLUGS.has(s));
  if (unknown.length > 0) {
    console.warn(
      `  ! ${unknown.length} categor${unknown.length === 1 ? 'y' : 'ies'} not in the ` +
        `known taxonomy — defaulting to 'outflow': ${unknown.join(', ')}`,
    );
  }

  const inflow = await db
    .update(categories)
    .set({ flowType: 'inflow' })
    .where(inArray(categories.slug, INFLOW))
    .returning({ slug: categories.slug });
  const transfer = await db
    .update(categories)
    .set({ flowType: 'transfer' })
    .where(inArray(categories.slug, TRANSFER))
    .returning({ slug: categories.slug });
  const outflow = await db
    .update(categories)
    .set({ flowType: 'outflow' })
    .where(notInArray(categories.slug, [...INFLOW, ...TRANSFER]))
    .returning({ slug: categories.slug });

  console.log('3/3  Done.');
  console.log(`  inflow:   ${inflow.length}  (${inflow.map((r) => r.slug).join(', ')})`);
  console.log(`  transfer: ${transfer.length}  (${transfer.map((r) => r.slug).join(', ')})`);
  console.log(`  outflow:  ${outflow.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
