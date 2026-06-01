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
import { ACCOUNT_TYPES, assetClassForType } from '@/lib/account-types';

const TYPE_SLUGS = ACCOUNT_TYPES.map((t) => t.slug);

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  type: z.string().min(1, 'Account type is required').max(60),
  institution: z.string().min(1, 'Institution is required').max(120),
  institutionDomain: z.string().max(120).optional().nullable(),
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

function normalizeDomain(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  try {
    const url = new URL(s.includes('://') ? s : `https://${s}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null;
  }
}

export const POST = handler(async (req: NextRequest) => {
  const body = bodySchema.parse(await req.json());
  if (!TYPE_SLUGS.includes(body.type)) return fail('invalid_type', 'Select a valid account type.', 400);

  const displayName = body.accountNumber
    ? `${body.name} ••${body.accountNumber}`
    : body.name;

  const [inserted] = await db
    .insert(accounts)
    .values({
      name: body.name,
      displayName,
      type: body.type,
      assetClass: assetClassForType(body.type),
      institution: body.institution,
      institutionDomain: normalizeDomain(body.institutionDomain),
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
