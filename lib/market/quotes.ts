/**
 * Market-data seam — provider-agnostic live quotes + daily series + benchmark,
 * for the Investments page (market value, gain/loss, index comparison). This is
 * the single place the app talks to a market-data provider, so it can be swapped
 * without touching callers. Default adapter: **Twelve Data** (twelvedata.com).
 *
 * The API key comes from Settings (`market_data_key`) or the MARKET_DATA_KEY env
 * var; with no key the functions return empty and the UI degrades to
 * statement-reported values. Free tiers are delayed + rate-limited, so responses
 * are cached (Next `revalidate`) and benchmarks use an ETF proxy (SPY) since free
 * tiers rarely expose index symbols.
 */

import { getSetting, MARKET_DATA_KEY } from '@/lib/settings';

export type Quote = { symbol: string; price: number; changePct: number | null };
export type PricePoint = { date: string; close: number };

export const DEFAULT_BENCHMARK = 'SPY'; // S&P 500 proxy (free tiers lack ^GSPC)
const BASE = 'https://api.twelvedata.com';

async function apiKey(): Promise<string | null> {
  const fromDb = await getSetting(MARKET_DATA_KEY).catch(() => null);
  return fromDb || process.env.MARKET_DATA_KEY || null;
}

/** Current (delayed) quotes for the given symbols. Empty map when unconfigured. */
export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const key = await apiKey();
  const syms = [...new Set(symbols.filter(Boolean))];
  if (!key || syms.length === 0) return out;
  try {
    const url = `${BASE}/quote?symbol=${encodeURIComponent(syms.join(','))}&apikey=${key}`;
    const res = await fetch(url, { next: { revalidate: 900 } }); // 15-min cache
    const json = await res.json();
    // Twelve Data returns one object for a single symbol, else a map by symbol.
    const rows: Record<string, { close?: string; percent_change?: string }> =
      syms.length === 1 ? { [syms[0]!]: json } : json;
    for (const s of syms) {
      const q = rows?.[s];
      const price = q?.close != null ? Number(q.close) : NaN;
      if (Number.isFinite(price)) {
        out.set(s, { symbol: s, price, changePct: q?.percent_change != null ? Number(q.percent_change) : null });
      }
    }
  } catch {
    /* degrade silently to statement values */
  }
  return out;
}

/**
 * Probe a provider key — the one passed in (unsaved, from the Settings field) or
 * the stored one — by fetching the benchmark quote. Returns a sample quote on
 * success, `null` if there's no key or the provider rejected it. Used by the
 * Settings "Test connection" button; never throws.
 */
export async function testMarketKey(providedKey?: string): Promise<Quote | null> {
  const key = providedKey?.trim() || (await apiKey());
  if (!key) return null;
  try {
    const url = `${BASE}/quote?symbol=${DEFAULT_BENCHMARK}&apikey=${key}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = await res.json();
    const price = json?.close != null ? Number(json.close) : NaN;
    if (!Number.isFinite(price)) return null;
    return {
      symbol: DEFAULT_BENCHMARK,
      price,
      changePct: json?.percent_change != null ? Number(json.percent_change) : null,
    };
  } catch {
    return null;
  }
}

/** Daily close series for a symbol (e.g. the benchmark overlay). Empty when unconfigured. */
export async function getDailySeries(symbol: string, outputsize = 365): Promise<PricePoint[]> {
  const key = await apiKey();
  if (!key || !symbol) return [];
  try {
    const url = `${BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}&apikey=${key}`;
    const res = await fetch(url, { next: { revalidate: 21_600 } }); // 6-hour cache
    const json = await res.json();
    const values: { datetime: string; close: string }[] = json?.values ?? [];
    return values
      .map((v) => ({ date: v.datetime, close: Number(v.close) }))
      .filter((p) => Number.isFinite(p.close))
      .reverse(); // provider returns newest-first
  } catch {
    return [];
  }
}
