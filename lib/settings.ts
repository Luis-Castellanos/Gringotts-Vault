/**
 * App-level settings (key/value in the DB). Used for the Anthropic API key +
 * model so they're manageable in Settings; falls back to env vars so a
 * self-hoster can set them either way.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { appSettings } from '@/lib/db/schema';

export const ANTHROPIC_KEY = 'anthropic_api_key';
export const ANTHROPIC_MODEL_KEY = 'anthropic_model';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getAnthropicKey(): Promise<string | null> {
  return (await getSetting(ANTHROPIC_KEY)) || process.env.ANTHROPIC_API_KEY || null;
}

export async function getAnthropicModel(): Promise<string> {
  return (await getSetting(ANTHROPIC_MODEL_KEY)) || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}
