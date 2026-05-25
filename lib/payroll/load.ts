/**
 * Server-only loader: reads the paystubs table and maps rows to the Stub shape
 * the Payroll page renders. Kept separate from data.ts (which is pure and
 * client-importable) so the pg/Drizzle imports never reach the client bundle.
 */

import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { paystubs } from '@/lib/db/schema';
import type { LineItem, Stub } from './data';

const n = (v: string | null) => (v == null ? 0 : Number(v));
const lines = (v: LineItem[] | null): LineItem[] => v ?? [];

function rateDisplay(baseComp: number): string {
  if (!baseComp) return '';
  return `$${baseComp.toLocaleString('en-US', { maximumFractionDigits: 0 })} / yr`;
}

// Format a raw pay-period (e.g. "01/01/2026-01/15/2026") for display.
function periodDisplay(raw: string | null, payDate: string | null): string {
  if (!raw) return payDate ?? '';
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return raw;
  const fmt = (mm: string, dd: string, yy: string) =>
    new Date(`${yy}-${mm}-${dd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const [, m1, d1, y1, m2, d2, y2] = m;
  return `${fmt(m1!, d1!, y1!)} – ${fmt(m2!, d2!, y2!)}, ${y2}`;
}

export async function loadStubs(): Promise<Stub[]> {
  const rows = await db.select().from(paystubs).orderBy(asc(paystubs.payDate));

  return rows.map((r) => {
    const earnings = lines(r.earnings);
    const bonus = earnings
      .filter((e) => /BONUS|SUPPL/i.test(e.label))
      .reduce((a, e) => a + e.amount, 0);
    const baseComp = n(r.baseComp);
    return {
      id: r.id,
      date: r.payDate ?? '',
      period: periodDisplay(r.payPeriod, r.payDate),
      voucher: r.voucher ?? '',
      employer: r.employer ?? '',
      baseComp,
      rate: rateDisplay(baseComp),
      gross: n(r.gross),
      net: n(r.net),
      hours: n(r.hours),
      deductionsTotal: n(r.deductionsTotal),
      taxesTotal: n(r.taxesTotal),
      employerTotal: n(r.employerTotal),
      nonCashFringe: n(r.nonCashFringe),
      bonus: +bonus.toFixed(2),
      earnings,
      deductions: lines(r.deductions),
      taxes: lines(r.taxes),
      contributions: lines(r.employerContributions),
      imputed: lines(r.imputed),
      deposits: r.deposits ?? [],
    };
  });
}
