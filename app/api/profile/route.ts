/**
 * Owner profile + sidebar prefs.
 *   GET   → { name, avatarKind, avatarGradient, avatarImage, navHidden }
 *   PATCH → any subset of the above (avatarImage is a data URL or null)
 *
 * Behind auth middleware like everything else. The Sidebar reads this once on
 * mount; Settings writes it and broadcasts a client event so the chip updates live.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { handler, ok } from '@/lib/api/respond';
import { getProfile, setProfile } from '@/lib/profile/load';

export const runtime = 'nodejs';

export const GET = handler(async () => {
  return ok(await getProfile());
});

const patchSchema = z.object({
  name: z.string().max(80).optional(),
  avatarKind: z.enum(['gradient', 'image']).optional(),
  avatarGradient: z.string().max(40).optional(),
  // data URL for a small, client-downscaled image (~tens of KB); cap generously.
  avatarImage: z.string().max(2_000_000).nullable().optional(),
  navHidden: z.array(z.string().max(60)).max(40).optional(),
  navOrder: z.array(z.string().max(60)).max(60).optional(),
});

export const PATCH = handler(async (req: NextRequest) => {
  const body = patchSchema.parse(await req.json());
  await setProfile(body);
  return ok(await getProfile());
});
