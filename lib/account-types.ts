/**
 * Canonical account / asset taxonomy.
 *
 * This constant is the seed + default for Vault's account types and groups
 * (label, asset class, group, icon, color). The live, user-editable copies live
 * in the `account_types` and `account_type_groups` tables; this file is the
 * source of truth for the built-in set and for synchronous lookups in code.
 */

export type AssetClass = 'asset' | 'liability';
export type AccountTypeGroup = 'banking' | 'credit_loans' | 'investments' | 'retirement' | 'property' | 'other';

export type AccountTypeDef = {
  slug: string;
  label: string;
  assetClass: AssetClass;
  group: AccountTypeGroup;
  icon: string; // emoji (matches lib/categories/icons.ts iconography)
};

export type GroupDef = { key: AccountTypeGroup; label: string; color: string };

export const ACCOUNT_TYPE_GROUPS: GroupDef[] = [
  { key: 'banking', label: 'Banking & cash', color: '#3b82f6' },
  { key: 'credit_loans', label: 'Credit & loans', color: '#ef4444' },
  { key: 'investments', label: 'Investments', color: '#8b5cf6' },
  { key: 'retirement', label: 'Retirement & tax-advantaged', color: '#06b6d4' },
  { key: 'property', label: 'Property & physical', color: '#22c55e' },
  { key: 'other', label: 'Other', color: '#94a3b8' },
];

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  // Banking & cash
  { slug: 'checking', label: 'Checking', assetClass: 'asset', group: 'banking', icon: '🏦' },
  { slug: 'savings', label: 'Savings', assetClass: 'asset', group: 'banking', icon: '🐷' },
  { slug: 'cash', label: 'Cash', assetClass: 'asset', group: 'banking', icon: '💵' },
  { slug: 'cash_management', label: 'Cash Management', assetClass: 'asset', group: 'banking', icon: '💼' },
  { slug: 'money_market', label: 'Money Market', assetClass: 'asset', group: 'banking', icon: '💱' },
  { slug: 'cd', label: 'CD', assetClass: 'asset', group: 'banking', icon: '🔒' },
  // Credit & loans
  { slug: 'credit_card', label: 'Credit Card', assetClass: 'liability', group: 'credit_loans', icon: '💳' },
  { slug: 'mortgage', label: 'Mortgage', assetClass: 'liability', group: 'credit_loans', icon: '🏠' },
  { slug: 'heloc', label: 'HELOC / Line of Credit', assetClass: 'liability', group: 'credit_loans', icon: '🏚️' },
  { slug: 'auto_loan', label: 'Auto Loan', assetClass: 'liability', group: 'credit_loans', icon: '🚗' },
  { slug: 'student_loan', label: 'Student Loan', assetClass: 'liability', group: 'credit_loans', icon: '🎓' },
  { slug: 'personal_loan', label: 'Personal Loan', assetClass: 'liability', group: 'credit_loans', icon: '🤝' },
  // Investments
  { slug: 'brokerage', label: 'Brokerage', assetClass: 'asset', group: 'investments', icon: '📈' },
  { slug: 'crypto', label: 'Crypto', assetClass: 'asset', group: 'investments', icon: '🪙' },
  { slug: 'espp', label: 'ESPP', assetClass: 'asset', group: 'investments', icon: '📊' },
  { slug: 'bonds', label: 'Bonds / Treasury', assetClass: 'asset', group: 'investments', icon: '🏛️' },
  // Retirement & tax-advantaged
  { slug: '401k', label: '401(k)', assetClass: 'asset', group: 'retirement', icon: '🏦' },
  { slug: 'roth_401k', label: 'Roth 401(k)', assetClass: 'asset', group: 'retirement', icon: '🌱' },
  { slug: 'traditional_ira', label: 'Traditional IRA', assetClass: 'asset', group: 'retirement', icon: '👵' },
  { slug: 'roth_ira', label: 'Roth IRA', assetClass: 'asset', group: 'retirement', icon: '🌿' },
  { slug: '403b', label: '403(b)', assetClass: 'asset', group: 'retirement', icon: '🏫' },
  { slug: '457b', label: '457(b)', assetClass: 'asset', group: 'retirement', icon: '🏛️' },
  { slug: 'hsa', label: 'HSA', assetClass: 'asset', group: 'retirement', icon: '🩺' },
  { slug: '529', label: '529', assetClass: 'asset', group: 'retirement', icon: '🎓' },
  { slug: 'pension', label: 'Pension', assetClass: 'asset', group: 'retirement', icon: '👴' },
  { slug: 'annuity', label: 'Annuity', assetClass: 'asset', group: 'retirement', icon: '📜' },
  // Property & physical
  { slug: 'real_estate', label: 'Real Estate', assetClass: 'asset', group: 'property', icon: '🏘️' },
  { slug: 'vehicle', label: 'Vehicle', assetClass: 'asset', group: 'property', icon: '🚗' },
  { slug: 'collectibles', label: 'Collectibles / Valuables', assetClass: 'asset', group: 'property', icon: '🖼️' },
  { slug: 'precious_metals', label: 'Precious Metals', assetClass: 'asset', group: 'property', icon: '🥇' },
  // Catch-all
  { slug: 'other', label: 'Other', assetClass: 'asset', group: 'other', icon: '📦' },
];

const BY_SLUG = new Map(ACCOUNT_TYPES.map((t) => [t.slug, t]));
const GROUP_BY_KEY = new Map(ACCOUNT_TYPE_GROUPS.map((g) => [g.key, g]));

export function accountTypeLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}
export function assetClassForType(slug: string): AssetClass {
  return BY_SLUG.get(slug)?.assetClass ?? 'asset';
}
export function accountTypeIcon(slug: string): string {
  return BY_SLUG.get(slug)?.icon ?? '📁';
}
export function groupColor(key: string): string {
  return GROUP_BY_KEY.get(key as AccountTypeGroup)?.color ?? '#94a3b8';
}

// A small curated emoji set for the type icon picker (finance-flavored).
export const ICON_CHOICES: string[] = [
  '🏦', '🐷', '💵', '💼', '💱', '🔒', '💳', '🏠', '🏚️', '🚗', '🎓', '🤝',
  '📈', '📉', '📊', '🪙', '🏛️', '🌱', '🌿', '👵', '👴', '🏫', '🩺', '📜',
  '🏘️', '🖼️', '🥇', '📦', '💰', '💎', '🧾', '📁', '🪪', '🏷️', '🎯', '⭐',
];
