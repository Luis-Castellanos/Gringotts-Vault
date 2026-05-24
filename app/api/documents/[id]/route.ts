/**
 * Stream a stored statement PDF.
 *
 *   GET /api/documents/[id]   → the original PDF (inline)
 *
 * The bytes live in documents.data (bytea); node-postgres returns it as a Buffer.
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';

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
