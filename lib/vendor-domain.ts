/**
 * Best-effort vendor → domain resolver for logo lookups.
 *
 * A curated keyword map covers common merchants (so their real brand logo
 * shows); anything unmatched falls back to a slug of the merchant name, which
 * the logo service will simply 404 on → the caller then shows initials.
 *
 * Patterns are matched against the lowercased merchant string in order, so put
 * more specific entries first (e.g. "uber eats" before "uber"). Keep patterns
 * high-confidence — a wrong logo is worse than initials.
 */

const VENDOR_MAP: [RegExp, string][] = [
  // ── Tech / subscriptions ──────────────────────────────────────────────
  [/\bapple\b|itunes|app ?store/, 'apple.com'],
  [/youtube|yt ?premium/, 'youtube.com'],
  [/\bgoogle\b|goog\s/, 'google.com'],
  [/netflix/, 'netflix.com'],
  [/spotify/, 'spotify.com'],
  [/amazon|amzn/, 'amazon.com'],
  [/microsoft|msft|xbox/, 'microsoft.com'],
  [/adobe/, 'adobe.com'],
  [/\bhulu\b/, 'hulu.com'],
  [/disney/, 'disneyplus.com'],
  [/hbo ?max|hbomax/, 'max.com'],
  [/paramount/, 'paramountplus.com'],
  [/peacock/, 'peacocktv.com'],
  [/openai|chatgpt/, 'openai.com'],
  [/anthropic|claude\.ai/, 'anthropic.com'],
  [/dropbox/, 'dropbox.com'],
  [/github/, 'github.com'],
  [/\bzoom\b/, 'zoom.us'],
  [/audible/, 'audible.com'],
  [/patreon/, 'patreon.com'],
  // ── Retail / grocery ──────────────────────────────────────────────────
  [/wal-?mart/, 'walmart.com'],
  [/\btarget\b/, 'target.com'],
  [/costco/, 'costco.com'],
  [/kroger/, 'kroger.com'],
  [/safeway/, 'safeway.com'],
  [/smart\s*&?\s*final/, 'smartandfinal.com'],
  [/trader ?joe/, 'traderjoes.com'],
  [/whole ?foods|wholefds/, 'wholefoodsmarket.com'],
  [/\bcvs\b/, 'cvs.com'],
  [/walgreens/, 'walgreens.com'],
  [/home ?depot/, 'homedepot.com'],
  [/lowe'?s\b/, 'lowes.com'],
  [/best ?buy/, 'bestbuy.com'],
  [/\bikea\b/, 'ikea.com'],
  [/\bralphs?\b/, 'ralphs.com'],
  [/\bvons\b/, 'vons.com'],
  [/albertsons/, 'albertsons.com'],
  [/\baldi\b/, 'aldi.us'],
  [/\bsprouts\b/, 'sprouts.com'],
  [/sam'?s ?club/, 'samsclub.com'],
  [/\betsy\b/, 'etsy.com'],
  [/\bebay\b/, 'ebay.com'],
  [/\bnike\b/, 'nike.com'],
  // ── Department stores / apparel ───────────────────────────────────────
  [/macy'?s/, 'macys.com'],
  [/nordstrom/, 'nordstrom.com'],
  [/\bkohl'?s/, 'kohls.com'],
  [/\bross\b/, 'rossstores.com'],
  [/t\.?j\.? ?maxx|tjmaxx/, 'tjmaxx.com'],
  [/marshalls/, 'marshalls.com'],
  [/old ?navy/, 'oldnavy.com'],
  [/\bgap\b/, 'gap.com'],
  [/\bh&m\b|h ?and ?m/, 'hm.com'],
  [/\bzara\b/, 'zara.com'],
  [/sephora/, 'sephora.com'],
  [/\bulta\b/, 'ulta.com'],
  [/lululemon/, 'lululemon.com'],
  [/foot ?locker/, 'footlocker.com'],
  [/dick'?s ?sporting/, 'dickssportinggoods.com'],
  // ── Pets / home / office ──────────────────────────────────────────────
  [/petco/, 'petco.com'],
  [/petsmart/, 'petsmart.com'],
  [/michaels/, 'michaels.com'],
  [/\bstaples\b/, 'staples.com'],
  [/office ?depot/, 'officedepot.com'],
  [/autozone/, 'autozone.com'],
  [/o'?reilly/, 'oreillyauto.com'],
  [/gamestop/, 'gamestop.com'],
  // ── Fitness ───────────────────────────────────────────────────────────
  [/planet ?fitness/, 'planetfitness.com'],
  [/24 ?hour ?fitness/, '24hourfitness.com'],
  [/\bla ?fitness/, 'lafitness.com'],
  [/equinox/, 'equinox.com'],
  // ── Food / restaurants ────────────────────────────────────────────────
  [/starbucks/, 'starbucks.com'],
  [/mcdonald/, 'mcdonalds.com'],
  [/chipotle/, 'chipotle.com'],
  [/el ?pollo ?loco/, 'elpolloloco.com'],
  [/taco ?bell/, 'tacobell.com'],
  [/in.?n.?out/, 'in-n-out.com'],
  [/domino'?s/, 'dominos.com'],
  [/pizza ?hut/, 'pizzahut.com'],
  [/\bsubway\b/, 'subway.com'],
  [/panera/, 'panerabread.com'],
  [/chick.?fil.?a/, 'chick-fil-a.com'],
  [/wendy'?s/, 'wendys.com'],
  [/burger ?king/, 'bk.com'],
  [/\bkfc\b/, 'kfc.com'],
  [/popeyes/, 'popeyes.com'],
  [/jack ?in ?the ?box/, 'jackinthebox.com'],
  [/denny'?s/, 'dennys.com'],
  [/\bihop\b/, 'ihop.com'],
  [/dunkin/, 'dunkindonuts.com'],
  [/panda ?express/, 'pandaexpress.com'],
  // ── Delivery (before rideshare) ───────────────────────────────────────
  [/doordash/, 'doordash.com'],
  [/uber ?eats|ubereats/, 'ubereats.com'],
  [/grubhub/, 'grubhub.com'],
  [/instacart/, 'instacart.com'],
  [/postmates/, 'postmates.com'],
  // ── Transport / gas ───────────────────────────────────────────────────
  [/\buber\b/, 'uber.com'],
  [/\blyft\b/, 'lyft.com'],
  [/\bshell\b/, 'shell.com'],
  [/chevron/, 'chevron.com'],
  [/exxon|\bmobil\b/, 'exxon.com'],
  [/\barco\b/, 'arco.com'],
  [/valero/, 'valero.com'],
  // ── Travel ────────────────────────────────────────────────────────────
  [/marriott/, 'marriott.com'],
  [/hilton/, 'hilton.com'],
  [/airbnb/, 'airbnb.com'],
  [/expedia/, 'expedia.com'],
  [/delta ?air/, 'delta.com'],
  [/united ?air/, 'united.com'],
  [/american ?airlines/, 'aa.com'],
  [/southwest ?air|southwest/, 'southwest.com'],
  // ── Telecom / utilities ───────────────────────────────────────────────
  [/verizon/, 'verizon.com'],
  [/\bat&t\b|\batt\b/, 'att.com'],
  [/t.?mobile/, 't-mobile.com'],
  [/comcast|xfinity/, 'xfinity.com'],
  [/spectrum/, 'spectrum.com'],
  // ── Finance / payments ────────────────────────────────────────────────
  [/\bchase\b/, 'chase.com'],
  [/american ?express|\bamex\b/, 'americanexpress.com'],
  [/capital ?one/, 'capitalone.com'],
  [/bank ?of ?america|\bbofa\b/, 'bankofamerica.com'],
  [/wells ?fargo/, 'wellsfargo.com'],
  [/\bciti\b/, 'citi.com'],
  [/discover/, 'discover.com'],
  [/paypal/, 'paypal.com'],
  [/venmo/, 'venmo.com'],
  [/cash ?app/, 'cash.app'],
  [/\bzelle\b/, 'zelle.com'],
  [/\bally\b/, 'ally.com'],
  [/fidelity/, 'fidelity.com'],
  [/schwab/, 'schwab.com'],
  [/robinhood/, 'robinhood.com'],
  [/coinbase/, 'coinbase.com'],
  // ── Shipping ──────────────────────────────────────────────────────────
  [/\bups\b/, 'ups.com'],
  [/fedex/, 'fedex.com'],
  [/\busps\b|postal ?service/, 'usps.com'],
];

/**
 * Domain for a merchant's brand logo, or null if we don't recognize it.
 * We deliberately only return curated, high-confidence domains: the favicon
 * service returns a generic globe (not a 404) for unknown domains, so guessing
 * from the raw name would litter messy merchants with globe icons instead of
 * clean initials.
 */
export function vendorDomain(merchant: string): string | null {
  const n = merchant.toLowerCase();
  for (const [re, domain] of VENDOR_MAP) if (re.test(n)) return domain;
  return null;
}
