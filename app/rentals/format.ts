import type { PropertyRow } from '@/lib/properties/load';

// Currency / percent / date formatting is shared app-wide.
export { fmtMoney, fmtMoney0, fmtPct, fmtDate } from '@/lib/format';

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
