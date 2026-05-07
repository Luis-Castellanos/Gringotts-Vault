/**
 * Merchant string utilities.
 *
 * Two related but distinct operations:
 *
 *   merchantPrefix(raw)   — the matching key used to find similar transactions.
 *                           Stable across statement quirks (different store
 *                           numbers, different addresses, etc.). Used in API
 *                           queries: WHERE raw ILIKE prefix || '%'.
 *
 *   cleanMerchant(raw)    — display-ready merchant name. Crude but useful;
 *                           strips trailing addresses, ZIPs, phone numbers.
 *                           Used at import time to populate `merchant`.
 *
 * Both are deliberately simple. The "real" answer is a merchant_rules table
 * with regex patterns, but that's v2. These get us 80% of the way there.
 */

/**
 * Returns the leading 1-3 alphanumeric tokens of a raw description.
 * Used as a SQL ILIKE prefix to match similar transactions.
 *
 * Examples:
 *   "PAPA JOHNS #4558 8947 SUNLAND BLVD ..."  → "PAPA JOHNS"
 *   "APPLE.COM/BILL One Apple Park Way ..."   → "APPLE.COM/BILL"
 *   "CHIPOTLE ONLINE 1401 WYNKOOP ..."        → "CHIPOTLE ONLINE"
 *   "ACH Deposit Internet transfer ..."       → "ACH Deposit"
 */
export function merchantPrefix(raw: string): string {
  const tokens = raw.trim().split(/\s+/);
  // Take leading non-numeric tokens up to 3 of them
  const out: string[] = [];
  for (const tok of tokens) {
    if (out.length >= 3) break;
    // Stop once we hit an obvious "address starts here" token: a # marker, a long
    // digit run, or a state code at the wrong position.
    if (/^#?\d{3,}$/.test(tok)) break;
    if (out.length > 0 && /^\d/.test(tok)) break;
    out.push(tok);
  }
  return out.join(' ') || raw.slice(0, 20);
}

/**
 * Best-effort cleanup of a raw bank-statement string into something a human
 * wants to see. Not perfect; will need refinement over time. The right
 * long-term answer is per-merchant rules, but this gets v1 going.
 */
export function cleanMerchant(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s+USA\s*$/i, '');
  s = s.replace(/\s+[A-Z]{2}\s+\d{5}\s*$/, '');
  s = s.replace(/\s+\d{5}(-\d{4})?\s*$/, '');
  s = s.replace(/\s+\d{10}\s*$/, '');
  // Cut at the first long-digit token (usually street number) if there's
  // already a clean leading word
  const m = s.match(/^([^\d]+?)(\s+\d{3,}\s)/);
  if (m) s = m[1];
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
