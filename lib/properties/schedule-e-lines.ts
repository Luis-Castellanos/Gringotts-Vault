/**
 * IRS Schedule E (Form 1040, Part I) expense-line definitions + the keyword
 * fallback that maps a category name onto a line when no explicit mapping is
 * set on the category (`categories.schedule_e_line`). Pure data + functions (no
 * DB import) so both the server loader and the client mapping editor can use it.
 */

export type SELineDef = { line: number; key: string; label: string };

export const SE_LINE_DEFS: SELineDef[] = [
  { line: 5, key: 'advertising', label: 'Advertising' },
  { line: 6, key: 'auto_travel', label: 'Auto and travel' },
  { line: 7, key: 'cleaning', label: 'Cleaning and maintenance' },
  { line: 8, key: 'commissions', label: 'Commissions' },
  { line: 9, key: 'insurance', label: 'Insurance' },
  { line: 10, key: 'legal', label: 'Legal and other professional fees' },
  { line: 11, key: 'management', label: 'Management fees' },
  { line: 12, key: 'mortgage_interest', label: 'Mortgage interest (banks, etc.)' },
  { line: 14, key: 'repairs', label: 'Repairs' },
  { line: 15, key: 'supplies', label: 'Supplies' },
  { line: 16, key: 'taxes', label: 'Taxes' },
  { line: 17, key: 'utilities', label: 'Utilities' },
  { line: 18, key: 'depreciation', label: 'Depreciation expense' },
  { line: 19, key: 'other', label: 'Other' },
];

export const SE_KEYS = new Set(SE_LINE_DEFS.map((d) => d.key));
export const labelForKey = (key: string): string => SE_LINE_DEFS.find((d) => d.key === key)?.label ?? 'Other';

// Ordered: first match wins, so specific patterns precede generic ones.
const RULES: { re: RegExp; key: string }[] = [
  { re: /advertis|marketing|listing/i, key: 'advertising' },
  { re: /auto|travel|mileage/i, key: 'auto_travel' },
  { re: /clean/i, key: 'cleaning' },
  { re: /commission/i, key: 'commissions' },
  { re: /insurance/i, key: 'insurance' },
  { re: /legal|attorney|accounting|professional|tax prep/i, key: 'legal' },
  { re: /manage|mgmt/i, key: 'management' },
  { re: /interest/i, key: 'mortgage_interest' },
  { re: /repair|fix|plumb|hvac|electric(?!ity)|appliance/i, key: 'repairs' },
  { re: /suppl/i, key: 'supplies' },
  { re: /property tax|prop tax|\btax(es)?\b/i, key: 'taxes' },
  { re: /utilit|electric|water|sewer|\bgas\b|trash|internet|cable/i, key: 'utilities' },
  { re: /maintenance|hoa|lawn|landscap|pest|turnover/i, key: 'cleaning' },
];

/** Keyword-based line key for a category name (the fallback / "Auto" mapping). */
export function keywordLineKey(categoryName: string): string {
  for (const r of RULES) if (r.re.test(categoryName)) return r.key;
  return 'other';
}

/** Resolved line key: explicit mapping wins; else the keyword heuristic. */
export function resolveLineKey(categoryName: string, explicit: string | null | undefined): string {
  if (explicit && SE_KEYS.has(explicit)) return explicit;
  return keywordLineKey(categoryName);
}
