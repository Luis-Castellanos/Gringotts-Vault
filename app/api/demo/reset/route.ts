/**
 * Reseed the demo database back to its pristine sample data.
 *   POST → the "Reset demo data" button in the demo banner
 *   GET  → the daily Vercel cron (see vercel.json)
 *
 * Guarded by DEMO_MODE: on the real (non-demo) deployment this returns 404, so
 * the destructive reseed can NEVER run against the owner's real database — even
 * though the cron is configured on both deployments from the shared repo.
 */

import { DEMO_MODE } from '@/lib/demo/mode';
import { seedDemo } from '@/lib/demo/seed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function run() {
  if (!DEMO_MODE) return new Response('Not found', { status: 404 });
  const counts = await seedDemo();
  return Response.json({ ok: true, counts });
}

export async function POST() {
  return run();
}
export async function GET() {
  return run();
}
