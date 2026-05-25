/**
 * Re-clean merchant names: recompute the `merchant` column for every transaction
 * by re-running cleanMerchant() over the stored raw description, updating only
 * rows whose value actually changes. Used by both the CLI
 * (scripts/reclean-merchants.ts) and the Settings "Re-clean merchants" button.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { transactions } from '@/lib/db/schema';
import { cleanMerchant } from '@/lib/transactions/merchant';

export type RecleanResult = {
  scanned: number;
  updated: number;
  samples: { before: string | null; after: string }[];
};

export async function recleanMerchants(): Promise<RecleanResult> {
  const rows = await db
    .select({ id: transactions.id, raw: transactions.rawDescription, merchant: transactions.merchant })
    .from(transactions);

  let updated = 0;
  const samples: { before: string | null; after: string }[] = [];
  for (const r of rows) {
    const next = cleanMerchant(r.raw);
    if (next === r.merchant) continue;
    await db.update(transactions).set({ merchant: next }).where(eq(transactions.id, r.id));
    if (samples.length < 8) samples.push({ before: r.merchant, after: next });
    updated += 1;
  }
  return { scanned: rows.length, updated, samples };
}
