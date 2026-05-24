/**
 * Institution → logo helpers, shared by the Accounts and Files pages.
 * We render a Google favicon for the institution's domain, with an initials
 * fallback. (There are no local logo assets — public/bank-logos is empty.)
 */

export const INST_DOMAINS: Record<string, string> = {
  Chase: 'chase.com',
  'Bank of America': 'bankofamerica.com',
  'American Express': 'americanexpress.com',
  'Capital One': 'capitalone.com',
  Discover: 'discover.com',
  Citi: 'citi.com',
  'Ally Bank': 'ally.com',
  'U.S. Bank': 'usbank.com',
  'Charles Schwab': 'schwab.com',
  Fidelity: 'fidelity.com',
  Vanguard: 'vanguard.com',
  'Apple / Goldman Sachs': 'apple.com',
  'Goldman Sachs / Apple': 'apple.com',
  'Apple / Green Dot Bank': 'apple.com',
  'Synchrony Bank / Venmo': 'venmo.com',
  'Gain Federal Credit Union': 'gainfcu.com',
};

export function instDomain(inst: string): string | null {
  if (!inst) return null;
  if (INST_DOMAINS[inst]) return INST_DOMAINS[inst];
  return inst.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

export function instInitials(inst: string): string {
  return (
    (inst || '?')
      .split(/[\s/-]/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
