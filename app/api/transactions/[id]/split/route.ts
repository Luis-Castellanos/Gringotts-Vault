/**
 * Split a transaction into parts.
 *
 *   GET    ?propertyId=…  → { proposal, existing }  (amortization-based proposal
 *                            for a mortgage payment + any current splits)
 *   POST   { propertyId, parts:[{categoryId, amount, kind, label}] } → create
 *   DELETE → un-split
 */

import { NextRequest } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { transactions, transactionSplits } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { proposeMortgageSplit, splitTransaction, unsplitTransaction } from '@/lib/transactions/split';

export const GET = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const propertyId = req.nextUrl.searchParams.get('propertyId');

  const [txn] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!txn) return fail('not_found', 'Transaction not found.', 404);

  const existing = await db
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, id))
    .orderBy(asc(transactionSplits.sortOrder));

  const proposal = propertyId ? await proposeMortgageSplit(propertyId, Number(txn.amount), txn.date) : null;

  return ok({
    amount: Number(txn.amount),
    date: txn.date,
    isSplit: txn.isSplit,
    existing,
    proposal: proposal && proposal.ok ? proposal.parts : null,
    proposalError: proposal && !proposal.ok ? proposal.error : null,
  });
});

const partSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  amount: z.number(),
  kind: z.enum(['expense', 'principal', 'escrow', 'transfer']),
  label: z.string().max(120).optional().nullable(),
});
const bodySchema = z.object({
  propertyId: z.string().uuid().nullable().optional(),
  parts: z.array(partSchema).min(2, 'A split needs at least two parts.'),
});

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = bodySchema.parse(await req.json());
  const result = await splitTransaction(
    id,
    body.parts.map((p) => ({ categoryId: p.categoryId, amount: p.amount, kind: p.kind, label: p.label ?? null })),
    body.propertyId ?? null,
  );
  if (!result.ok) return fail('split_failed', result.error, 400);
  return ok({ id });
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await unsplitTransaction(id);
  return ok({ id });
});
