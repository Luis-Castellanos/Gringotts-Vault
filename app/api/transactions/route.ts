/**
 * GET /api/transactions?offset=&limit=
 * A page of transactions (newest first), same shape as the Transactions page's
 * initial load. Powers infinite scroll.
 */

import { NextRequest } from 'next/server';

import { handler, ok } from '@/lib/api/respond';
import { loadTransactions } from '@/lib/transactions/load';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0) || 0);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 200) || 200));
  const rows = await loadTransactions(limit, offset);
  return ok(rows);
});
