/**
 * Canonical formatting helpers. Pages used to each define their own fmtMoney /
 * money0 / usd — this is the single source so currency, percent, and date
 * formatting read identically everywhere. Null/NaN → an em dash.
 */

export function fmtMoney(
  n: number | null | undefined,
  { decimals = 2, sign = false }: { decimals?: number; sign?: boolean } = {},
): string {
  if (n == null || Number.isNaN(n)) return '—';
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (sign && n > 0) return `+$${s}`;
  return (neg ? '-$' : '$') + s;
}

/** Whole-dollar money, e.g. $1,234. */
export function fmtMoney0(n: number | null | undefined): string {
  return fmtMoney(n, { decimals: 0 });
}

/** Signed whole-dollar money, e.g. +$1,234 / -$56. */
export function fmtSigned0(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

export function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(d) + '%';
}

/** Month + year, e.g. "May 2026". Pass {day:true} for "May 24, 2026". */
export function fmtDate(iso: string | null | undefined, { day = false }: { day?: boolean } = {}): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    day ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', year: 'numeric' });
}
