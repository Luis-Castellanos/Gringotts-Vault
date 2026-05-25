/**
 * Create a goal (Goals page).
 *   POST /api/goals   Body: name, type, target/date/contribution, accountIds[]
 */

import { NextRequest } from 'next/server';

import { db } from '@/lib/db/client';
import { goalAccounts, goals } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { goalSchema } from '@/lib/goals/validation';

const money = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));

export const POST = handler(async (req: NextRequest) => {
  const b = goalSchema.parse(await req.json());
  const [created] = await db
    .insert(goals)
    .values({
      name: b.name,
      type: b.type,
      targetAmount: money(b.targetAmount),
      targetDate: b.targetDate ?? null,
      monthlyContribution: money(b.monthlyContribution),
      icon: b.icon ?? null,
      color: b.color ?? null,
    })
    .returning({ id: goals.id });
  if (!created) return fail('insert_failed', 'Could not create goal.', 500);

  if (b.accountIds?.length) {
    await db.insert(goalAccounts).values(b.accountIds.map((accountId) => ({ goalId: created.id, accountId })));
  }
  return ok({ id: created.id }, { status: 201 });
});
