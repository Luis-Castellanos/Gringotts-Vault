/**
 * Persistence for the tax-engine workspace. Stored as a JSON blob per year in
 * the app_settings KV table (key `tax_workspace_<year>`). This is the tax tool's
 * OWN data — deliberately separate from Vault's financial tables, so the engine
 * stays decoupled (and the whole thing can branch off later).
 */

import { getSetting, setSetting } from '@/lib/settings';
import { normalizeWorkspace, type TaxWorkspace, type FilingStatus, SUPPORTED_YEARS, LATEST_TAX_YEAR } from '@/lib/tax-engine';

const key = (year: number) => `tax_workspace_${year}`;

export function resolveTaxYear(year: number | undefined): number {
  return year && SUPPORTED_YEARS.includes(year) ? year : LATEST_TAX_YEAR;
}

export async function loadWorkspace(year: number, filingStatus: FilingStatus = 'single'): Promise<TaxWorkspace> {
  const raw = await getSetting(key(year));
  let parsed: unknown = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  return normalizeWorkspace(parsed, year, filingStatus);
}

export async function saveWorkspace(ws: TaxWorkspace): Promise<void> {
  const normalized = normalizeWorkspace(ws, ws.taxYear, ws.filingStatus);
  await setSetting(key(normalized.taxYear), JSON.stringify(normalized));
}
