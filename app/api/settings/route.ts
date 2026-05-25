/**
 * App settings (Anthropic key + model).
 *   GET   → { hasAnthropicKey, keySource, model }   (never returns the key itself)
 *   PATCH → { anthropicApiKey?, model? }            (empty key string clears it)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { handler, ok } from '@/lib/api/respond';
import { ANTHROPIC_KEY, ANTHROPIC_MODEL_KEY, getAnthropicKey, getAnthropicModel, getSetting, setSetting } from '@/lib/settings';

export const runtime = 'nodejs';

export const GET = handler(async () => {
  const dbKey = await getSetting(ANTHROPIC_KEY);
  const key = await getAnthropicKey();
  return ok({
    hasAnthropicKey: !!key,
    keySource: dbKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'env' : 'none',
    model: await getAnthropicModel(),
  });
});

const patchSchema = z.object({
  anthropicApiKey: z.string().max(200).nullable().optional(),
  model: z.string().max(80).optional(),
});

export const PATCH = handler(async (req: NextRequest) => {
  const body = patchSchema.parse(await req.json());
  if (body.anthropicApiKey !== undefined) {
    const trimmed = body.anthropicApiKey?.trim();
    await setSetting(ANTHROPIC_KEY, trimmed ? trimmed : null);
  }
  if (body.model !== undefined) await setSetting(ANTHROPIC_MODEL_KEY, body.model.trim() || null);
  return ok({ ok: true });
});
