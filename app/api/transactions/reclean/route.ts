/**
 * Re-clean merchant names across the whole ledger (Settings → Data maintenance).
 *   POST /api/transactions/reclean → { scanned, updated, samples }
 */

import { handler, ok } from '@/lib/api/respond';
import { recleanMerchants } from '@/lib/transactions/reclean';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = handler(async () => ok(await recleanMerchants()));
