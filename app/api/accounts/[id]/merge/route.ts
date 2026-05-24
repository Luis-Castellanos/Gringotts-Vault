/**
 * POST /api/accounts/[id]/merge
 * Move every transaction (and import record) from this account into another,
 * then delete the now-empty source. Used to fix duplicate accounts created when
 * a master-file label doesn't match a preloaded account name.
 *
 * Body: { targetId: string }
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accounts, imports, transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const bodySchema = z.object({ targetId: z.string().uuid() });

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json());

  if (body.targetId === id) return fail('invalid_target', 'Pick a different target account.', 400);

  const [src] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!src) return fail('not_found', 'Source account not found.', 404);
  const [tgt] = await db.select().from(accounts).where(eq(accounts.id, body.targetId)).limit(1);
  if (!tgt) return fail('not_found', 'Target account not found.', 404);

  const moved = await db
    .update(transactions)
    .set({ accountId: body.targetId, updatedAt: new Date() })
    .where(eq(transactions.accountId, id))
    .returning({ id: transactions.id });

  await db.update(imports).set({ accountId: body.targetId }).where(eq(imports.accountId, id));

  await db.delete(accounts).where(eq(accounts.id, id));

  return ok({ moved: moved.length, deletedAccount: id });
});
