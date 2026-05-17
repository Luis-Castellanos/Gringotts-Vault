/**
 * One-shot preload of the user's active accounts.
 *
 * Idempotent: matches on (name, account_number). If a row already exists with
 * the same pair, skipped. Type/institution/etc. are NOT updated for existing
 * rows — that would silently overwrite the user's edits. Use a separate
 * update script if you need to backfill metadata.
 *
 * Usage:
 *   tsx scripts/preload-accounts.ts
 */

import 'dotenv/config';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';

type Seed = {
  name: string;
  accountNumber: string;
  type: typeof accounts.$inferInsert['type'];
  institution: string | null;
  openedAt?: string;
};

const SEEDS: Seed[] = [
  // Credit cards (10) — from screenshot 2026-05-17
  { name: 'Amex Blue Cash Preferred',  accountNumber: '1007', type: 'credit_card', institution: 'American Express' },
  { name: 'Amex Gold',                 accountNumber: '1001', type: 'credit_card', institution: 'American Express' },
  { name: 'Apple Card',                accountNumber: '7999', type: 'credit_card', institution: 'Goldman Sachs / Apple' },
  { name: 'Bank of America Customized', accountNumber: '6601', type: 'credit_card', institution: 'Bank of America' },
  { name: 'Chase Freedom Unlimited',   accountNumber: '4781', type: 'credit_card', institution: 'Chase' },
  { name: 'Chase Prime Visa',          accountNumber: '5944', type: 'credit_card', institution: 'Chase' },
  { name: 'Chase Sapphire Reserve',    accountNumber: '0173', type: 'credit_card', institution: 'Chase' },
  { name: 'Citi Simplicity',           accountNumber: '6772', type: 'credit_card', institution: 'Citi' },
  { name: 'Discover It Card',          accountNumber: '6586', type: 'credit_card', institution: 'Discover' },
  { name: 'Gain Mastercard',           accountNumber: '6534', type: 'credit_card', institution: 'Gain Federal Credit Union' },
];

function assetClassFor(type: Seed['type']): 'asset' | 'liability' {
  return type === 'credit_card' || type === 'loan' ? 'liability' : 'asset';
}

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const s of SEEDS) {
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.name, s.name), eq(accounts.accountNumber, s.accountNumber)));

    if (existing[0]) {
      console.log(`  [=] Skipped (exists): ${s.name} ••${s.accountNumber}`);
      skipped++;
      continue;
    }

    const assetClass = assetClassFor(s.type);
    const displayName = `${s.name} ••${s.accountNumber}`;

    await db.insert(accounts).values({
      name: s.name,
      displayName,
      accountNumber: s.accountNumber,
      type: s.type,
      assetClass,
      institution: s.institution,
      openedAt: s.openedAt,
    });

    console.log(`  [+] Inserted: ${displayName} (${s.type}, ${assetClass}, ${s.institution ?? 'no institution'})`);
    inserted++;
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
