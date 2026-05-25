/**
 * Property photo — stored as bytea so it travels with the database.
 *   POST  (multipart, field "file")  → store the image, point imageUrl at this route
 *   GET                              → serve the stored image
 */

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { properties } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';

export const runtime = 'nodejs';

const MAX_BYTES = 8 * 1024 * 1024;

export const POST = handler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('no_file', 'Send an image under the "file" field.', 400);
  if (!file.type.startsWith('image/')) return fail('bad_type', 'That file is not an image.', 400);
  if (file.size > MAX_BYTES) return fail('too_big', 'Image must be under 8 MB.', 400);

  const buf = Buffer.from(await file.arrayBuffer());
  // Cache-busting version so the stable photo URL refreshes after a re-upload.
  const url = `/api/properties/${id}/photo?v=${Date.now()}`;
  const [updated] = await db
    .update(properties)
    .set({ image: buf, imageMime: file.type, imageUrl: url, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning({ id: properties.id });
  if (!updated) return fail('not_found', 'Property not found.', 404);
  return ok({ imageUrl: url });
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db
    .select({ image: properties.image, mime: properties.imageMime })
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  if (!row?.image) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.image), {
    headers: {
      'Content-Type': row.mime ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
