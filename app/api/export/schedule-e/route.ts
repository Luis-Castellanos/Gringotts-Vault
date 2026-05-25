/**
 * Schedule E worksheet export (xlsx) for a property + tax year.
 *   GET /api/export/schedule-e?propertyId=…&year=YYYY
 */

import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

import { loadScheduleE } from '@/lib/properties/schedule-e';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const propertyId = sp.get('propertyId');
  const year = Number(sp.get('year')) || new Date().getFullYear();
  if (!propertyId) return new Response('propertyId is required', { status: 400 });

  const se = await loadScheduleE(propertyId, year);
  if (!se) return new Response('Property not found', { status: 404 });

  const rows = [
    { Item: 'Rents received (line 3)', Amount: se.rents },
    { Item: '', Amount: '' },
    { Item: 'EXPENSES', Amount: '' },
    ...se.lines.map((l) => ({ Item: `${l.label} (line ${l.line})`, Amount: l.amount })),
    { Item: 'Total expenses (line 20)', Amount: se.totalExpenses },
    { Item: '', Amount: '' },
    { Item: 'Net income / (loss) (line 21)', Amount: se.netIncome },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: ['Item', 'Amount'] });
  ws['!cols'] = [{ wch: 38 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Schedule E ${se.year}`);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const safe = se.propertyName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'property';
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="schedule-e-${safe}-${se.year}.xlsx"`,
    },
  });
}
