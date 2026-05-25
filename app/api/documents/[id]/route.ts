/**
 * Stream a stored statement PDF.
 *
 *   GET /api/documents/[id]   → the original PDF (inline)
 *
 * The bytes live in documents.data (bytea); node-postgres returns it as a Buffer.
 */

import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, documents, imports, transactions } from '@/lib/db/schema';
import { fail, ok } from '@/lib/api/respond';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [doc] = await db
    .select({ data: documents.data, fileName: documents.fileName, mimeType: documents.mimeType })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  if (!doc) return new Response('Not found', { status: 404 });

  const safeName = doc.fileName.replace(/["\r\n]/g, '');
  const bytes = new Uint8Array(doc.data);
  return new Response(bytes, {
    headers: {
      'Content-Type': doc.mimeType || 'application/pdf',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  });
}

/**
 * Reassign a document to a different account.
 *   PATCH /api/documents/[id]   Body: { accountId }
 * Re-points the document, its import(s), and their transactions to the account.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return fail('bad_request', 'accountId is required.', 400);

  const [acct] = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(eq(accounts.id, body.accountId))
    .limit(1);
  if (!acct) return fail('not_found', 'Account not found.', 404);

  const [doc] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return fail('not_found', 'Document not found.', 404);

  // Re-point the import(s) for this document and their transactions.
  const imps = await db.select({ id: imports.id }).from(imports).where(eq(imports.documentId, id));
  const impIds = imps.map((i) => i.id);
  let moved = 0;
  if (impIds.length > 0) {
    await db.update(imports).set({ accountId: acct.id }).where(inArray(imports.id, impIds));
    const mv = await db
      .update(transactions)
      .set({ accountId: acct.id, updatedAt: new Date() })
      .where(inArray(transactions.importId, impIds))
      .returning({ id: transactions.id });
    moved = mv.length;
  }

  await db
    .update(documents)
    .set({ accountIds: [acct.id], accountLabel: acct.displayName })
    .where(eq(documents.id, id));

  return ok({ id, accountId: acct.id, movedTransactions: moved });
}

/**
 * Remove a document.
 *   DELETE /api/documents/[id]            → remove the file only (transactions stay)
 *   DELETE /api/documents/[id]?withData=1 → also remove the transactions it imported
 *
 * Transactions are found precisely via imports.document_id (set at upload).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const withData = new URL(req.url).searchParams.get('withData') === '1';

  const imps = await db.select({ id: imports.id }).from(imports).where(eq(imports.documentId, id));
  const impIds = imps.map((i) => i.id);

  let deletedTransactions = 0;
  if (withData && impIds.length > 0) {
    const dt = await db
      .delete(transactions)
      .where(inArray(transactions.importId, impIds))
      .returning({ id: transactions.id });
    deletedTransactions = dt.length;
    await db.delete(imports).where(inArray(imports.id, impIds));
  }

  // FK on imports.document_id is ON DELETE SET NULL, so a file-only delete
  // leaves any import + its transactions intact (just unlinked).
  const del = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (del.length === 0) return fail('not_found', 'Document not found.', 404);

  return ok({ id, removedData: withData, deletedTransactions });
}
