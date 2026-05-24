/**
 * Create a new account.
 *
 *   POST /api/accounts
 *   Body: name, type, ...optional metadata
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { accounts } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

const TYPES = ['checking', 'savings', 'credit_card', 'brokerage', 'retirement', 'loan', 'cash', 'other'] as const;

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  type: z.enum(TYPES).default('credit_card'),
  institution: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(32).optional().nullable(),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  apr: z.number().min(0).max(100).optional().nullable(),
  apy: z.number().min(0).max(100).optional().nullable(),
  interestRate: z.number().min(0).max(100).optional().nullable(),
  monthlyPayment: z.number().nonnegative().optional().nullable(),
  originalPrincipal: z.number().nonnegative().optional().nullable(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  accountSubtype: z.string().max(60).optional().nullable(),
});

function assetClassFor(type: (typeof TYPES)[number]): 'asset' | 'liability' {
  return type === 'credit_card' || type === 'loan' ? 'liability' : 'asset';
}

export const POST = handler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json());

  const displayName = body.accountNumber
    ? `${body.name} ••${body.accountNumber}`
    : body.name;

  const [inserted] = await db
    .insert(accounts)
    .values({
      name: body.name,
      displayName,
      type: body.type,
      assetClass: assetClassFor(body.type),
      institution: body.institution ?? null,
      accountNumber: body.accountNumber ?? null,
      openedAt: body.openedAt ?? null,
      creditLimit: body.creditLimit != null ? body.creditLimit.toFixed(2) : null,
      apr: body.apr != null ? body.apr.toFixed(2) : null,
      apy: body.apy != null ? body.apy.toFixed(3) : null,
      interestRate: body.interestRate != null ? body.interestRate.toFixed(3) : null,
      monthlyPayment: body.monthlyPayment != null ? body.monthlyPayment.toFixed(2) : null,
      originalPrincipal: body.originalPrincipal != null ? body.originalPrincipal.toFixed(2) : null,
      maturityDate: body.maturityDate ?? null,
      accountSubtype: body.accountSubtype ?? null,
    })
    .returning({ id: accounts.id });

  if (!inserted) return fail('insert_failed', 'Could not create account.', 500);
  return ok({ id: inserted.id }, { status: 201 });
});
