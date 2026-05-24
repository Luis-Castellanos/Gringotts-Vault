/**
 * Update a single account.
 *
 *   PATCH /api/accounts/[id]
 *   Body: partial account fields
 *
 *   Validation: openedAt cannot be after the earliest transaction for this
 *   account. Closing a card sets isActive=false and closedAt automatically.
 */

import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const TYPES = ['checking', 'savings', 'credit_card', 'brokerage', 'retirement', 'loan', 'cash', 'other'] as const;

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(TYPES).optional(),
  institution: z.string().max(120).nullable().optional(),
  accountNumber: z.string().max(32).nullable().optional(),
  isActive: z.boolean().optional(),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  closedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  apr: z.number().min(0).max(100).nullable().optional(),
  apy: z.number().min(0).max(100).nullable().optional(),
  interestRate: z.number().min(0).max(100).nullable().optional(),
  monthlyPayment: z.number().nonnegative().nullable().optional(),
  originalPrincipal: z.number().nonnegative().nullable().optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
  accountSubtype: z.string().max(60).nullable().optional(),
  signupBonus: z
    .object({
      amount: z.number().nonnegative(),
      type: z.string().max(40),
      valuationCents: z.number().nonnegative(),
      spendRequired: z.number().nonnegative(),
      spendDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    })
    .nullable()
    .optional(),
  benefits: z.array(z.string().max(120)).max(20).nullable().optional(),
});

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);
    if (!existing) return fail('not_found', 'Account not found.', 404);

    // Validation: openedAt cannot be after the account's earliest transaction.
    if (body.openedAt !== undefined && body.openedAt !== null) {
      const [{ minDate }] = await db
        .select({ minDate: sql<string | null>`MIN(${transactions.date})::text` })
        .from(transactions)
        .where(eq(transactions.accountId, id));

      if (minDate && body.openedAt > minDate) {
        return fail(
          'invalid_opened_date',
          `Opened date can't be after ${minDate} — there's already a transaction from that date for this account.`,
          400,
        );
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.institution !== undefined) patch.institution = body.institution;
    if (body.accountNumber !== undefined) patch.accountNumber = body.accountNumber;
    if (body.openedAt !== undefined) patch.openedAt = body.openedAt;
    if (body.creditLimit !== undefined) {
      patch.creditLimit = body.creditLimit != null ? body.creditLimit.toFixed(2) : null;
    }
    if (body.apr !== undefined) {
      patch.apr = body.apr != null ? body.apr.toFixed(2) : null;
    }
    if (body.apy !== undefined) patch.apy = body.apy != null ? body.apy.toFixed(3) : null;
    if (body.interestRate !== undefined) patch.interestRate = body.interestRate != null ? body.interestRate.toFixed(3) : null;
    if (body.monthlyPayment !== undefined) patch.monthlyPayment = body.monthlyPayment != null ? body.monthlyPayment.toFixed(2) : null;
    if (body.originalPrincipal !== undefined) patch.originalPrincipal = body.originalPrincipal != null ? body.originalPrincipal.toFixed(2) : null;
    if (body.maturityDate !== undefined) patch.maturityDate = body.maturityDate;
    if (body.accountSubtype !== undefined) patch.accountSubtype = body.accountSubtype;
    if (body.signupBonus !== undefined) patch.signupBonus = body.signupBonus;
    if (body.benefits !== undefined) {
      patch.benefits = body.benefits && body.benefits.length > 0 ? body.benefits : null;
    }
    if (body.type !== undefined) {
      patch.type = body.type;
      patch.assetClass = body.type === 'credit_card' || body.type === 'loan' ? 'liability' : 'asset';
    }

    // Close/reopen handling: closing sets closedAt automatically if absent;
    // re-opening clears closedAt unless caller passed one explicitly.
    if (body.isActive !== undefined) {
      patch.isActive = body.isActive;
      if (!body.isActive && body.closedAt === undefined) {
        patch.closedAt = new Date().toISOString().slice(0, 10);
      } else if (body.isActive && body.closedAt === undefined) {
        patch.closedAt = null;
      }
    }
    if (body.closedAt !== undefined) patch.closedAt = body.closedAt;

    await db.update(accounts).set(patch).where(eq(accounts.id, id));
    return ok({ id });
  },
);

/**
 * DELETE /api/accounts/[id]
 * Refuses if the account still has transactions — merge it into another account
 * first (so history isn't orphaned).
 */
export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;

  const [acct] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  if (!acct) return fail('not_found', 'Account not found.', 404);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.accountId, id));
  if (n > 0) {
    return fail('has_transactions', `This account has ${n} transaction${n === 1 ? '' : 's'}. Merge it into another account first.`, 409);
  }

  await db.delete(accounts).where(eq(accounts.id, id));
  return ok({ id });
});
