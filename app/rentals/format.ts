import type { PropertyRow } from '@/lib/properties/load';

export function fmtMoney0(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return (
    (n < 0 ? '-$' : '$') +
    Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtPct(n: number | null | undefined, d = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(d) + '%';
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** "City, ST 12345" or the best subset available. */
export function addressLine(p: Pick<PropertyRow, 'city' | 'state' | 'zip'>): string {
  const cityState = [p.city, p.state].filter(Boolean).join(', ');
  return [cityState, p.zip].filter(Boolean).join(' ').trim();
}

/** Equity as a % of value (LTV-complement). */
export function equityPct(p: Pick<PropertyRow, 'marketValue' | 'acquisitionPrice' | 'equity'>): number | null {
  const value = p.marketValue ?? p.acquisitionPrice ?? 0;
  if (value <= 0) return null;
  return (p.equity / value) * 100;
}

/** Beds · baths · sqft summary line. */
export function specLine(p: Pick<PropertyRow, 'beds' | 'baths' | 'sqft'>): string {
  const parts: string[] = [];
  if (p.beds != null) parts.push(`${p.beds} bd`);
  if (p.baths != null) parts.push(`${p.baths} ba`);
  if (p.sqft != null) parts.push(`${p.sqft.toLocaleString()} sqft`);
  return parts.join(' · ');
}
