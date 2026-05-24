/**
 * Canonical account / asset taxonomy.
 *
 * This constant is the seed + default for Vault's account types. The list is
 * also stored in the `account_types` table so it can be edited in Settings;
 * this file is the source of truth for the built-in set and for synchronous
 * label/asset-class lookups in code. Adding a type here + re-seeding keeps the
 * two in sync; user-added types live only in the table.
 */

export type AssetClass = 'asset' | 'liability';
export type AccountTypeGroup = 'banking' | 'credit_loans' | 'investments' | 'retirement' | 'property' | 'other';

export type AccountTypeDef = {
  slug: string;
  label: string;
  assetClass: AssetClass;
  group: AccountTypeGroup;
};

export const ACCOUNT_TYPE_GROUPS: { key: AccountTypeGroup; label: string }[] = [
  { key: 'banking', label: 'Banking & cash' },
  { key: 'credit_loans', label: 'Credit & loans' },
  { key: 'investments', label: 'Investments' },
  { key: 'retirement', label: 'Retirement & tax-advantaged' },
  { key: 'property', label: 'Property & physical' },
  { key: 'other', label: 'Other' },
];

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  // Banking & cash
  { slug: 'checking', label: 'Checking', assetClass: 'asset', group: 'banking' },
  { slug: 'savings', label: 'Savings', assetClass: 'asset', group: 'banking' },
  { slug: 'cash', label: 'Cash', assetClass: 'asset', group: 'banking' },
  { slug: 'cash_management', label: 'Cash Management', assetClass: 'asset', group: 'banking' },
  { slug: 'money_market', label: 'Money Market', assetClass: 'asset', group: 'banking' },
  { slug: 'cd', label: 'CD', assetClass: 'asset', group: 'banking' },
  // Credit & loans
  { slug: 'credit_card', label: 'Credit Card', assetClass: 'liability', group: 'credit_loans' },
  { slug: 'mortgage', label: 'Mortgage', assetClass: 'liability', group: 'credit_loans' },
  { slug: 'heloc', label: 'HELOC / Line of Credit', assetClass: 'liability', group: 'credit_loans' },
  { slug: 'auto_loan', label: 'Auto Loan', assetClass: 'liability', group: 'credit_loans' },
  { slug: 'student_loan', label: 'Student Loan', assetClass: 'liability', group: 'credit_loans' },
  { slug: 'personal_loan', label: 'Personal Loan', assetClass: 'liability', group: 'credit_loans' },
  // Investments
  { slug: 'brokerage', label: 'Brokerage', assetClass: 'asset', group: 'investments' },
  { slug: 'crypto', label: 'Crypto', assetClass: 'asset', group: 'investments' },
  { slug: 'espp', label: 'ESPP', assetClass: 'asset', group: 'investments' },
  { slug: 'bonds', label: 'Bonds / Treasury', assetClass: 'asset', group: 'investments' },
  // Retirement & tax-advantaged
  { slug: '401k', label: '401(k)', assetClass: 'asset', group: 'retirement' },
  { slug: 'roth_401k', label: 'Roth 401(k)', assetClass: 'asset', group: 'retirement' },
  { slug: 'traditional_ira', label: 'Traditional IRA', assetClass: 'asset', group: 'retirement' },
  { slug: 'roth_ira', label: 'Roth IRA', assetClass: 'asset', group: 'retirement' },
  { slug: '403b', label: '403(b)', assetClass: 'asset', group: 'retirement' },
  { slug: '457b', label: '457(b)', assetClass: 'asset', group: 'retirement' },
  { slug: 'hsa', label: 'HSA', assetClass: 'asset', group: 'retirement' },
  { slug: '529', label: '529', assetClass: 'asset', group: 'retirement' },
  { slug: 'pension', label: 'Pension', assetClass: 'asset', group: 'retirement' },
  { slug: 'annuity', label: 'Annuity', assetClass: 'asset', group: 'retirement' },
  // Property & physical
  { slug: 'real_estate', label: 'Real Estate', assetClass: 'asset', group: 'property' },
  { slug: 'vehicle', label: 'Vehicle', assetClass: 'asset', group: 'property' },
  { slug: 'collectibles', label: 'Collectibles / Valuables', assetClass: 'asset', group: 'property' },
  { slug: 'precious_metals', label: 'Precious Metals', assetClass: 'asset', group: 'property' },
  // Catch-all
  { slug: 'other', label: 'Other', assetClass: 'asset', group: 'other' },
];

const BY_SLUG = new Map(ACCOUNT_TYPES.map((t) => [t.slug, t]));

export function accountTypeLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export function assetClassForType(slug: string): AssetClass {
  return BY_SLUG.get(slug)?.assetClass ?? 'asset';
}
