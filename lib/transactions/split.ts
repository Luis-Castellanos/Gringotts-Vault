/**
 * Transaction splitting. Breaks one transaction into categorized parts stored in
 * `transaction_splits`. The parent's `amount` is never changed, so account
 * balances are unaffected; reports expand `is_split` parents into their parts.
 *
 * A transfer part (mortgage principal, escrow) additionally creates a real
 * destination transaction in the target account so the money actually moves:
 *   principal → +amount into the mortgage account (reduces the loan owed)
 *   escrow    → +amount into the property's escrow account (an asset)
 * interest stays a plain outflow part (no destination — it's spending).
 *
 * First consumer: the mortgage payment split (see proposeMortgageSplit).
 */

import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { accounts, categories, properties, transactions, transactionSplits } from '@/lib/db/schema';
import { amortize } from '@/lib/properties/amortization';

export type SplitKind = 'expense' | 'principal' | 'escrow' | 'transfer';

export type SplitPartInput = {
  categoryId: string | null;
  amount: number; // signed, same sign convention as the parent
  kind: SplitKind;
  label?: string | null;
};

const money = (n: number) => n.toFixed(2);

async function resolveEscrowAccount(propertyId: string, propertyName: string, existing: string | null): Promise<string | null> {
  if (existing) return existing;
  const name = `${propertyName} Escrow`;
  const [acct] = await db
    .insert(accounts)
    .values({ name, displayName: name, type: 'cash', assetClass: 'asset', accountSubtype: 'Escrow' })
    .returning({ id: accounts.id });
  if (!acct) return null;
  await db.update(properties).set({ escrowAccountId: acct.id, updatedAt: new Date() }).where(eq(properties.id, propertyId));
  return acct.id;
}

/** Remove a transaction's splits and any destination (transfer-leg) rows they created. */
export async function unsplitTransaction(txnId: string): Promise<void> {
  const existing = await db
    .select({ transferTxnId: transactionSplits.transferTxnId })
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, txnId));
  const destIds = existing.map((s) => s.transferTxnId).filter((x): x is string => !!x);
  if (destIds.length) await db.delete(transactions).where(inArray(transactions.id, destIds));
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, txnId));
  await db.update(transactions).set({ isSplit: false, updatedAt: new Date() }).where(eq(transactions.id, txnId));
}

/**
 * Split `txnId` into `parts` (which must sum to its amount). `propertyId` links
 * principal/escrow parts to the right destination accounts. Re-splitting first
 * clears any existing splits. Returns the created split count.
 */
export async function splitTransaction(
  txnId: string,
  parts: SplitPartInput[],
  propertyId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [txn] = await db.select().from(transactions).where(eq(transactions.id, txnId)).limit(1);
  if (!txn) return { ok: false, error: 'Transaction not found.' };
  if (parts.length < 2) return { ok: false, error: 'A split needs at least two parts.' };

  const parentAmount = Number(txn.amount);
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum - parentAmount) > 0.01) {
    return { ok: false, error: `Parts (${sum.toFixed(2)}) must sum to the transaction amount (${parentAmount.toFixed(2)}).` };
  }

  // Resolve destination accounts (mortgage / escrow) from the linked property.
  let mortgageAccountId: string | null = null;
  let escrowAccountId: string | null = null;
  const needsMortgage = parts.some((p) => p.kind === 'principal');
  const needsEscrow = parts.some((p) => p.kind === 'escrow');
  if ((needsMortgage || needsEscrow) && propertyId) {
    const [prop] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
    if (prop) {
      mortgageAccountId = prop.mortgageAccountId;
      if (needsEscrow) escrowAccountId = await resolveEscrowAccount(prop.id, prop.name, prop.escrowAccountId);
    }
  }
  if (needsMortgage && !mortgageAccountId) {
    return { ok: false, error: 'No mortgage account linked to this property — link one to record a principal transfer.' };
  }

  await unsplitTransaction(txnId);

  for (const [i, p] of parts.entries()) {
    let transferTxnId: string | null = null;
    const isTransfer = p.kind === 'principal' || p.kind === 'escrow' || p.kind === 'transfer';
    const destAccountId = p.kind === 'principal' ? mortgageAccountId : p.kind === 'escrow' ? escrowAccountId : null;

    if (isTransfer && destAccountId) {
      // The +leg into the destination account (money moving in).
      const [dest] = await db
        .insert(transactions)
        .values({
          accountId: destAccountId,
          categoryId: p.categoryId,
          date: txn.date,
          amount: money(Math.abs(p.amount)),
          rawDescription: `${p.label ?? 'Split'} · ${txn.merchant ?? txn.rawDescription}`,
          merchant: txn.merchant,
          isTransfer: true,
          transferPairId: txnId,
          needsReview: false,
          statementPeriod: txn.statementPeriod,
          sourceFile: txn.sourceFile,
          contentHash: `split:${txnId}:${i}`,
        })
        .returning({ id: transactions.id });
      transferTxnId = dest?.id ?? null;
    }

    await db.insert(transactionSplits).values({
      transactionId: txnId,
      categoryId: p.categoryId,
      amount: money(p.amount),
      isTransfer,
      transferTxnId,
      label: p.label ?? null,
      sortOrder: i,
    });
  }

  await db.update(transactions).set({ isSplit: true, updatedAt: new Date() }).where(eq(transactions.id, txnId));
  return { ok: true };
}

// A non-transfer split part (e.g. mortgage interest), shaped like a Cashflow row
// so spend/income reports can fold these in where they exclude the split parent.
// Transfer parts (principal/escrow) are omitted — their destination legs already
// carry them. The flow comes from the part's category (null → outflow).
export type SplitContribution = {
  date: string;
  amount: number;
  isTransfer: false;
  flowType: 'inflow' | 'outflow' | 'transfer' | null;
  catId: string | null;
  catName: string | null;
  catColor: string | null;
  parentId: string | null;
  parentName: string | null;
  parentColor: string | null;
  accountId: string | null;
  accountName: string | null;
  merchant: string | null;
};

export async function loadSplitContributions(
  opts: { from?: string | null; to?: string | null; accountIds?: string[] } = {},
): Promise<SplitContribution[]> {
  const parent = alias(categories, 'split_parent_cat');
  const conds = [eq(transactions.isSplit, true), eq(transactionSplits.isTransfer, false)];
  if (opts.from) conds.push(gte(transactions.date, opts.from));
  if (opts.to) conds.push(lte(transactions.date, opts.to));
  if (opts.accountIds?.length) conds.push(inArray(transactions.accountId, opts.accountIds));

  const rows = await db
    .select({
      date: transactions.date,
      amount: transactionSplits.amount,
      flowType: categories.flowType,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
      parentId: parent.id,
      parentName: parent.name,
      parentColor: parent.color,
      accountId: transactions.accountId,
      accountName: accounts.name,
      merchant: transactions.merchant,
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
    .leftJoin(categories, eq(transactionSplits.categoryId, categories.id))
    .leftJoin(parent, eq(categories.parentId, parent.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...conds));

  return rows.map((r) => ({
    date: r.date,
    amount: Number(r.amount),
    isTransfer: false as const,
    flowType: r.flowType,
    catId: r.catId,
    catName: r.catName,
    catColor: r.catColor,
    parentId: r.parentId,
    parentName: r.parentName,
    parentColor: r.parentColor,
    accountId: r.accountId,
    accountName: r.accountName,
    merchant: r.merchant,
  }));
}

export type ProposedPart = { kind: SplitKind; label: string; amount: number };

/**
 * Propose a principal/interest/escrow breakdown for a mortgage payment, using
 * the property's amortization schedule for the payment nearest `date`. Escrow =
 * |payment| − (principal + interest), if positive. Amounts are signed to match
 * the parent (negative for an outflow from checking).
 */
export async function proposeMortgageSplit(
  propertyId: string,
  paymentAmount: number,
  date: string,
): Promise<{ ok: true; parts: ProposedPart[] } | { ok: false; error: string }> {
  const [prop] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
  if (!prop) return { ok: false, error: 'Property not found.' };
  if (!prop.mortgageAccountId) return { ok: false, error: 'No mortgage account linked to this property.' };
  const [acct] = await db.select().from(accounts).where(eq(accounts.id, prop.mortgageAccountId)).limit(1);
  if (!acct) return { ok: false, error: 'Mortgage account not found.' };

  const sched = amortize({
    principal: acct.originalPrincipal != null ? Number(acct.originalPrincipal) : 0,
    aprPct: acct.interestRate != null ? Number(acct.interestRate) : null,
    monthlyPayment: acct.monthlyPayment != null ? Number(acct.monthlyPayment) : null,
    startDate: acct.openedAt,
    maturityDate: acct.maturityDate,
  });
  if (!sched.ok) return { ok: false, error: `Can't compute the schedule: ${sched.reason}` };

  // Nearest scheduled payment by date (fall back to the to-date position).
  let row = sched.rows.find((r) => r.date === date);
  if (!row && sched.monthsElapsed != null) row = sched.rows[Math.min(sched.monthsElapsed, sched.rows.length - 1)];
  if (!row) row = sched.rows[0];
  if (!row) return { ok: false, error: 'No schedule rows.' };

  const sign = paymentAmount < 0 ? -1 : 1;
  const abs = Math.abs(paymentAmount);
  const principal = Math.min(row.principal, abs);
  const interest = Math.min(row.interest, abs - principal);
  const escrow = Math.max(0, Math.round((abs - principal - interest) * 100) / 100);

  const parts: ProposedPart[] = [
    { kind: 'principal', label: 'Principal', amount: sign * principal },
    { kind: 'expense', label: 'Interest', amount: sign * interest },
  ];
  if (escrow > 0) parts.push({ kind: 'escrow', label: 'Escrow (taxes + insurance)', amount: sign * escrow });
  return { ok: true, parts };
}
