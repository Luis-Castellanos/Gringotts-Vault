/**
 * Per-statement balance-chain drill-down for the audit page.
 *   GET /api/audit/[importId] → ChainAudit (rows + the row where the chain breaks)
 */

import { handler, fail, ok } from '@/lib/api/respond';
import { loadStatementChain } from '@/lib/audit/load';

export const runtime = 'nodejs';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ importId: string }> }) => {
  const { importId } = await ctx.params;
  const chain = await loadStatementChain(importId);
  if (!chain) return fail('not_found', 'Statement not found.', 404);
  return ok(chain);
});
