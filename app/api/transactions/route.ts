/**
 * GET /api/transactions?offset=&limit=&sort=&q=&from=&to=&account=&cat=&merchant=&amin=&amax=&hideTransfers=&needsReview=
 * A filtered, sorted page of transactions (same shape + ordering as the
 * Transactions page's initial load). Returns { rows, total } where `total` is
 * the count matching the current filters. Powers search, filtering and
 * infinite scroll.
 */

import { NextRequest } from 'next/server';

import { handler, ok } from '@/lib/api/respond';
import {
  countTransactions,
  loadTransactions,
  parseSort,
  type TxnFilters,
} from '@/lib/transactions/load';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0);
  // No `limit` param → load every matching row (the page preloads the full set).
  const limitRaw = sp.get('limit');
  const limit = limitRaw ? Math.min(50000, Math.max(1, Number(limitRaw) || 200)) : null;
  const sort = parseSort(sp.get('sort'));

  const aminRaw = sp.get('amin');
  const amaxRaw = sp.get('amax');
  const filters: TxnFilters = {
    search: sp.get('q') ?? undefined,
    from: sp.get('from'),
    to: sp.get('to'),
    accountIds: sp.getAll('account'),
    categoryIds: sp.getAll('cat'),
    merchants: sp.getAll('merchant'),
    amountMin: aminRaw ? Math.abs(Number(aminRaw)) : null,
    amountMax: amaxRaw ? Math.abs(Number(amaxRaw)) : null,
    hideTransfers: sp.get('hideTransfers') === '1',
    needsReviewOnly: sp.get('needsReview') === '1',
  };

  const [rows, total] = await Promise.all([
    loadTransactions(limit, offset, filters, sort),
    countTransactions(filters),
  ]);
  return ok({ rows, total });
});
