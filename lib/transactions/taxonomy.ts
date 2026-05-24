/**
 * Pure taxonomy helpers shared by the loader and audit scripts. No DB / IO here
 * so the slug logic can't drift between import and validation.
 *
 * The master.xlsx taxonomy is 3-tier: Type → Category → Sub-category, mapping to
 * Vault's flow_type → parent category → child category. Slugs are Type-prefixed
 * so names repeated across flow types (Zelle, Check, Other) stay unique.
 */

export type Flow = 'inflow' | 'outflow' | 'transfer';

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function typeToFlow(type: string): Flow {
  const t = (type ?? '').trim().toLowerCase();
  if (t.startsWith('inflow')) return 'inflow';
  if (t.startsWith('transfer')) return 'transfer';
  return 'outflow';
}

export function flowSlug(flow: Flow): string {
  return flow === 'inflow' ? 'inflows' : flow === 'transfer' ? 'transfers' : 'outflows';
}

export function parentSlug(flow: Flow, category: string): string {
  return `${flowSlug(flow)}-${slugify(category)}`;
}

export function childSlug(flow: Flow, category: string, sub: string): string {
  return `${flowSlug(flow)}-${slugify(category)}-${slugify(sub)}`;
}

// Fallback bucket for transaction rows whose category names don't resolve.
export const UNCATEGORIZED_SLUG = 'outflows-other-uncategorized';

export const CATEGORY_PALETTE = [
  '#10b981', '#3b82f6', '#f97316', '#ec4899', '#a855f7', '#06b6d4', '#ef4444',
  '#d946ef', '#14b8a6', '#64748b', '#0ea5e9', '#84cc16', '#f59e0b', '#8b5cf6',
  '#22c55e', '#fb7185', '#38bdf8', '#a3e635',
];
