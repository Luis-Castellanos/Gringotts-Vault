/**
 * Tax workspace persistence.
 *   GET  /api/tax?year=2025 → the stored workspace for that year (normalized)
 *   PUT  /api/tax           → save the workspace (body = the full workspace JSON)
 *
 * Behind auth middleware like everything else. The workspace is the tax tool's
 * own user-entered data; it is NOT sourced from Vault's financial tables.
 */

import { NextRequest } from 'next/server';

import { handler, ok, fail } from '@/lib/api/respond';
import { loadWorkspace, saveWorkspace, resolveTaxYear } from '@/lib/tax/workspace-store';
import { normalizeWorkspace, SUPPORTED_YEARS } from '@/lib/tax-engine';

export const runtime = 'nodejs';

export const GET = handler(async (req: NextRequest) => {
  const year = resolveTaxYear(Number(new URL(req.url).searchParams.get('year')) || undefined);
  return ok(await loadWorkspace(year));
});

export const PUT = handler(async (req: NextRequest) => {
  const body = await req.json();
  const year = Number(body?.taxYear);
  if (!SUPPORTED_YEARS.includes(year)) return fail('bad_year', `Unsupported tax year ${year}.`, 400);
  const ws = normalizeWorkspace(body, year, body?.filingStatus ?? 'single');
  await saveWorkspace(ws);
  return ok({ saved: true });
});
