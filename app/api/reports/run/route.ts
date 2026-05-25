/**
 * Run a custom report query.
 *   POST /api/reports/run  body: ReportQueryDef → ReportResult
 */

import { NextRequest } from 'next/server';

import { handler, ok } from '@/lib/api/respond';
import { runQuery } from '@/lib/reports/query';
import { queryDefSchema } from '@/lib/reports/query-validation';

export const runtime = 'nodejs';

export const POST = handler(async (req: NextRequest) => {
  const def = queryDefSchema.parse(await req.json());
  return ok(await runQuery(def));
});
