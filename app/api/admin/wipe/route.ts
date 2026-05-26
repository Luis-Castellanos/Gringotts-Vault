/**
 * DESTRUCTIVE — delete all user data (Settings → Delete all data).
 *   POST { confirm: "DELETE" } → wipes data, keeps seed taxonomy + auth + settings.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, handler, ok } from '@/lib/api/respond';
import { wipeAllData } from '@/lib/admin/reset';

export const runtime = 'nodejs';

const schema = z.object({ confirm: z.string() });

export const POST = handler(async (req: NextRequest) => {
  const { confirm } = schema.parse(await req.json());
  if (confirm !== 'DELETE') {
    return fail('not_confirmed', 'Confirmation text did not match.', 400);
  }
  const counts = await wipeAllData();
  return ok({ counts });
});
