/**
 * Destructive full-data wipe (Settings → "Delete all data"). Clears everything
 * the user added — transactions, files, accounts, holdings, paystubs, imports,
 * balances, and the whole real-estate set — back to a clean slate.
 *
 * KEEPS, deliberately: the default seed taxonomy (categories, account_types,
 * account_type_groups), vendor_rules, the owner's passkeys (webauthn_credentials
 * — wiping them would lock the user out), and app_settings (profile + sidebar +
 * API keys). Category customizations are reset via restoreCategoryTaxonomy().
 *
 * Deletion order respects FKs: splits → transactions (restrict on accounts) →
 * the rest → accounts last.
 */

import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import {
  accounts,
  balanceSnapshots,
  capex,
  documents,
  holdings,
  imports,
  leases,
  maintenance,
  paystubs,
  properties,
  reportQueries,
  transactionSplits,
  transactions,
} from '@/lib/db/schema';

export async function wipeAllData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const wipe = async (label: string, table: PgTable) => {
    const deleted = await db.delete(table).returning({ one: sql<number>`1` });
    counts[label] = deleted.length;
  };

  await wipe('transactionSplits', transactionSplits);
  await wipe('transactions', transactions);
  await wipe('holdings', holdings);
  await wipe('paystubs', paystubs);
  await wipe('balanceSnapshots', balanceSnapshots);
  await wipe('capex', capex);
  await wipe('maintenance', maintenance);
  await wipe('leases', leases);
  await wipe('properties', properties);
  await wipe('imports', imports);
  await wipe('documents', documents);
  await wipe('reportQueries', reportQueries);
  await wipe('accounts', accounts);

  return counts;
}
