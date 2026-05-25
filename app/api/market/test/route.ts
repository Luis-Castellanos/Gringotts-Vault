/**
 * Probe the market-data provider key (Settings "Test connection").
 *   POST { key? } → { ok, symbol?, price?, changePct? }
 * Tests the provided (unsaved) key when present, else the stored/env key.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { handler, ok } from '@/lib/api/respond';
import { testMarketKey } from '@/lib/market/quotes';

export const runtime = 'nodejs';

const bodySchema = z.object({ key: z.string().max(200).optional() });

export const POST = handler(async (req: NextRequest) => {
  const { key } = bodySchema.parse(await req.json().catch(() => ({})));
  const quote = await testMarketKey(key);
  if (!quote) return ok({ ok: false });
  return ok({ ok: true, symbol: quote.symbol, price: quote.price, changePct: quote.changePct });
});
