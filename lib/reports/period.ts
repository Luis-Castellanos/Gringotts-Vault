/**
 * Report period resolution (client + server safe — pure date math). Decouples
 * "period" from "year": the Reports page can show a calendar year, this
 * month/quarter, YTD, trailing-12-months, or a custom range. Comparisons (YoY
 * headline + Compare tab) use the immediately-preceding window of equal length.
 */

export type PeriodId = 'month' | 'quarter' | 'ytd' | 'ttm' | 'year' | 'custom';

export type ResolvedPeriod = { id: PeriodId; from: string; to: string; label: string; year?: number };

const iso = (d: Date): string => {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

export const PERIOD_PRESETS: { id: PeriodId; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'ytd', label: 'YTD' },
  { id: 'ttm', label: '12 mo' },
  { id: 'year', label: 'Year' },
  { id: 'custom', label: 'Custom' },
];

export function resolvePeriod(opts: { id?: string; year?: number; from?: string; to?: string }, latestYear: number): ResolvedPeriod {
  const today = new Date();
  const id = (opts.id as PeriodId) || 'year';
  if (id === 'custom' && opts.from && opts.to) {
    return { id: 'custom', from: opts.from, to: opts.to, label: `${opts.from} → ${opts.to}` };
  }
  if (id === 'month') {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { id, from: iso(f), to: iso(today), label: today.toLocaleString('en-US', { month: 'long', year: 'numeric' }) };
  }
  if (id === 'quarter') {
    const q = Math.floor(today.getMonth() / 3);
    const f = new Date(today.getFullYear(), q * 3, 1);
    return { id, from: iso(f), to: iso(today), label: `Q${q + 1} ${today.getFullYear()}` };
  }
  if (id === 'ytd') {
    return { id, from: `${today.getFullYear()}-01-01`, to: iso(today), label: `${today.getFullYear()} YTD` };
  }
  if (id === 'ttm') {
    const f = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    return { id, from: iso(f), to: iso(today), label: 'Trailing 12 months' };
  }
  const y = opts.year ?? latestYear;
  return { id: 'year', year: y, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

/** The immediately-preceding window of equal length, for period-over-period comparison. */
export function priorWindow(p: ResolvedPeriod): { from: string; to: string; label: string } {
  if (p.id === 'year' && p.year) {
    const y = p.year - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }
  const f = new Date(p.from + 'T00:00:00');
  const t = new Date(p.to + 'T00:00:00');
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const pt = new Date(f);
  pt.setDate(pt.getDate() - 1);
  const pf = new Date(pt);
  pf.setDate(pf.getDate() - (days - 1));
  return { from: iso(pf), to: iso(pt), label: 'prior period' };
}
