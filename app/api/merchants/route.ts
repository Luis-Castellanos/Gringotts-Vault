import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { fail, handler, ok } from '@/lib/api/respond';
import { db } from '@/lib/db/client';
import { categories, transactions, vendorRules } from '@/lib/db/schema';

const bodySchema = z.object({
  merchant: z.string().trim().min(1),
  nextMerchant: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().nullable(),
});

export const PATCH = handler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json());
  const merchant = body.merchant;
  const nextMerchant = body.nextMerchant;

  const [currentRule] = await db
    .select({ categoryId: vendorRules.categoryId })
    .from(vendorRules)
    .where(eq(vendorRules.merchant, merchant))
    .limit(1);

  const categoryId = body.categoryId;
  let isTransfer = false;
  if (categoryId) {
    const [cat] = await db
      .select({ id: categories.id, flowType: categories.flowType })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!cat) return fail('not_found', 'Category not found.', 404);
    isTransfer = cat.flowType === 'transfer';
  }

  if (merchant !== nextMerchant) {
    await db.delete(vendorRules).where(eq(vendorRules.merchant, merchant));
  }

  if (categoryId) {
    await db
      .insert(vendorRules)
      .values({ merchant: nextMerchant, categoryId, source: 'manual', hitCount: currentRule ? 1 : 0 })
      .onConflictDoUpdate({
        target: vendorRules.merchant,
        set: {
          categoryId,
          source: 'manual',
          updatedAt: new Date(),
        },
      });
  } else {
    await db.delete(vendorRules).where(eq(vendorRules.merchant, nextMerchant));
  }

  const set: Record<string, unknown> = {
    merchant: nextMerchant,
    updatedAt: new Date(),
  };
  if (categoryId) {
    set.categoryId = categoryId;
    set.needsReview = false;
    set.isTransfer = isTransfer;
  }

  const updated = await db
    .update(transactions)
    .set(set)
    .where(eq(transactions.merchant, merchant))
    .returning({ id: transactions.id });

  return ok({
    updated: updated.length,
    merchant: nextMerchant,
    categoryId,
    hadRule: !!currentRule,
  });
});
