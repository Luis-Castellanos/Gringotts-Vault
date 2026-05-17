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
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';

type Seed = {
  name: string;
  accountNumber: string | null;
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

  // Checking / savings / cash (14) — added 2026-05-17
  { name: 'Ally Savings',              accountNumber: '9491', type: 'savings',  institution: 'Ally Bank' },
  { name: 'Ally Checking',             accountNumber: '7211', type: 'checking', institution: 'Ally Bank' },
  { name: 'Amex Checking',             accountNumber: '0226', type: 'checking', institution: 'American Express' },
  { name: 'Amex HYSA',                 accountNumber: '4953', type: 'savings',  institution: 'American Express' },
  { name: 'Apple Cash',                accountNumber: null,   type: 'cash',     institution: 'Apple / Green Dot Bank' },
  { name: 'Apple Savings',             accountNumber: '1422', type: 'savings',  institution: 'Apple / Goldman Sachs' },
  { name: 'Bank of America',           accountNumber: '1741', type: 'checking', institution: 'Bank of America' },
  { name: 'Capital One',               accountNumber: '9865', type: 'checking', institution: 'Capital One' },
  { name: 'Chase Checking',            accountNumber: '4763', type: 'checking', institution: 'Chase' },
  { name: 'Fidelity Cash Management',  accountNumber: '1931', type: 'cash',     institution: 'Fidelity' },
  { name: 'Gain Checking',             accountNumber: '2538', type: 'checking', institution: 'Gain Federal Credit Union' },
  { name: 'Gain Savings',              accountNumber: '2538', type: 'savings',  institution: 'Gain Federal Credit Union' },
  { name: 'Schwab Checking',           accountNumber: '0031', type: 'checking', institution: 'Charles Schwab' },
  { name: 'US Bank Checking',          accountNumber: '6212', type: 'checking', institution: 'U.S. Bank' },
];

function assetClassFor(type: Seed['type']): 'asset' | 'liability' {
  return type === 'credit_card' || type === 'loan' ? 'liability' : 'asset';
}

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const s of SEEDS) {
    const numberPredicate = s.accountNumber === null
      ? isNull(accounts.accountNumber)
      : eq(accounts.accountNumber, s.accountNumber);
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.name, s.name), numberPredicate));

    const label = s.accountNumber ? `${s.name} ••${s.accountNumber}` : s.name;
    if (existing[0]) {
      console.log(`  [=] Skipped (exists): ${label}`);
      skipped++;
      continue;
    }

    const assetClass = assetClassFor(s.type);
    const displayName = label;

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
