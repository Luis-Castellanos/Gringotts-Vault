/**
 * Rule-based categorization — tier 2, after the vendor-map exact match and
 * before falling back to Uncategorized. Patterns match the RAW statement
 * description (richer + more stable than the cleaned merchant); transfers
 * resolve direction (in/out) from the amount sign.
 *
 * `confidence: 'high'` → safe to auto-confirm (clears review). `'low'` → set the
 * category but keep it in review for a human to confirm. Tuned to this single
 * user's accounts (audience of one), so person/self rules live here directly.
 *
 * Shared by ingest (`lib/ingest`) and the bulk re-categorizer
 * (`scripts/categorize-vault.ts`).
 */

export type CategoryHit = { slug: string; confidence: 'high' | 'low' };

const dir = (a: number) => (a < 0 ? 'out' : 'in');
const xfer = (type: string, a: number): string => `transfers-transfers_${dir(a)}-${type}`;
const zelle = (who: string, a: number): string => `${a < 0 ? 'outflows' : 'inflows'}-zelle-${who}`;

export function classifyByRules(raw: string, amount: number): CategoryHit | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' '); // collapse layout whitespace runs

  // ── Zelle (person vs. self/card) ──────────────────────────────────────────
  if (/zelle/.test(s)) {
    if (/julia|\bmom\b/.test(s)) return { slug: zelle('mom_julia', amount), confidence: 'high' };
    if (/gramps|hector/.test(s)) return { slug: zelle('gramps_hector', amount), confidence: 'high' };
    if (/american express/.test(s)) return { slug: xfer('credit_card_payment', amount), confidence: 'high' };
    if (/\bbofa\b|bank of america/.test(s)) return { slug: xfer('account_transfer', amount), confidence: 'high' };
    if (/luis castellan|luis a castella|luis angel|luis bofa/.test(s)) return { slug: xfer('account_transfer', amount), confidence: 'high' };
    return { slug: zelle('other', amount), confidence: 'high' };
  }

  // ── Transfers ─────────────────────────────────────────────────────────────
  if (/payment to chase card ending in|applecard gsbank|chase credit crd epay|discover (e-payment|net\/mobile|prearrange)|american ?express (ach pmt|retry|transfer)|americanexpress|capital one (crcardpmt|mobile pmt)|citi autopay|bank of america payment/.test(s))
    return { slug: xfer('credit_card_payment', amount), confidence: 'high' };
  if (/dept education student ln/.test(s)) return { slug: xfer('student_loan_payment', amount), confidence: 'high' };
  if (/robinhood|m1 finance|m1 spend|sofi securities|webull|td ameritrade|vanguard|wealthfront|schwab|fid bkg svc|fidelity|gemini|coinbase|voyager|moonpay|simplex|\bkalshi\b/.test(s))
    return { slug: xfer('investment_transfer', amount), confidence: 'high' };
  if (/online transfer (to|from) (chk|sav)|book transfer|real time transfer recd|apple cash|apple gs savings|apple savings|yotta saving|ally bank|alliant cu|sofi (money|bank)|t-mobile money|gain fcu ext|aspiration|wells fargo onl|cash app|paypal transfer|usbankdep|luis castellanos vscu|bank of america|jpmorgan chase/.test(s))
    return { slug: xfer('account_transfer', amount), confidence: 'high' };
  if (/sbad treas/.test(s)) return { slug: 'transfers-transfers_in-loan_proceeds', confidence: 'low' };

  // ── ATM / deposits / income / fees ────────────────────────────────────────
  if (/atm cash deposit/.test(s)) return { slug: 'inflows-other_inflows-atm_cash_deposit', confidence: 'high' };
  if (/atm check deposit/.test(s)) return { slug: 'inflows-other_inflows-check_deposit', confidence: 'high' };
  if (/atm withdraw/.test(s)) return { slug: 'outflows-financial-cash_atm', confidence: 'high' };
  if (/direct dep|title resource/.test(s)) return { slug: 'inflows-wages-paycheck', confidence: 'high' };
  if (/discover cash(back| award)/.test(s)) return { slug: 'inflows-rewards_bonuses-credit_card_cashback_points', confidence: 'high' };
  if (/insufficient funds fee|overdraft fee|foreign exch rt adj fee|\bservice fee\b|returned item/.test(s)) return { slug: 'outflows-financial-financial_fees', confidence: 'high' };

  // ── Spend (best-effort keywords → suggested, not auto-confirmed) ─────────────
  if (/aaa (ca )?insurance/.test(s)) return { slug: 'outflows-auto_transport-auto_insurance', confidence: 'low' };
  if (/mcw#|car wash/.test(s)) return { slug: 'outflows-auto_transport-auto_maintenance', confidence: 'low' };
  if (/autozone|o.?reilly/.test(s)) return { slug: 'outflows-auto_transport-auto_maintenance', confidence: 'low' };
  if (/fastrip|chevron|shell |arco|valero|mobil /.test(s)) return { slug: 'outflows-auto_transport-gas_charging', confidence: 'low' };
  if (/amzn mktp|amazon|\bebay\b/.test(s)) return { slug: 'outflows-shopping-online_shopping', confidence: 'low' };
  if (/spotify/.test(s)) return { slug: 'outflows-entertainment-music', confidence: 'low' };
  if (/disney plus|netflix|hulu|\bhbo\b|paramount/.test(s)) return { slug: 'outflows-bills_utilities-streaming', confidence: 'low' };
  if (/steam games|cdkeys|gamebillet/.test(s)) return { slug: 'outflows-entertainment-games', confidence: 'low' };
  if (/apple\.com bill|godaddy|gasbuddy/.test(s)) return { slug: 'outflows-bills_utilities-subscriptions', confidence: 'low' };
  if (/foodsco|vallarta|carniceria|dollar.?general|safeway|ralphs|trader joe|walmart|costco/.test(s)) return { slug: 'outflows-food_dining-groceries', confidence: 'low' };
  if (/jersey mikes|woodstocks pizza|pizza|mcdonald|taco|chipotle|wendy|subway|burger/.test(s)) return { slug: 'outflows-food_dining-fast_food', confidence: 'low' };
  if (/boba|coffee|starbucks|dutch bros/.test(s)) return { slug: 'outflows-food_dining-coffee_tea', confidence: 'low' };
  if (/cinemas|theatre|theater|\bamc\b/.test(s)) return { slug: 'outflows-entertainment-movies', confidence: 'low' };
  if (/parking|public works/.test(s)) return { slug: 'outflows-auto_transport-parking', confidence: 'low' };
  if (/flower/.test(s)) return { slug: 'outflows-gifts_donations-gifts', confidence: 'low' };
  if (/csu bakersfield|\bcsub\b|tuition/.test(s)) return { slug: 'outflows-education-tuition_fees', confidence: 'low' };
  if (/chegg|\bkobo\b|txtbk|textbook/.test(s)) return { slug: 'outflows-education-books_course_materials', confidence: 'low' };
  if (/candy|hotlix/.test(s)) return { slug: 'outflows-food_dining-snacks_pastries_bakery', confidence: 'low' };
  if (/glanbiaperf|supplement|vitamin/.test(s)) return { slug: 'outflows-health_wellness-wellness', confidence: 'low' };
  if (/wikipedia|red cross|donation/.test(s)) return { slug: 'outflows-gifts_donations-charity', confidence: 'low' };

  // PayPal is just the payment method — the real merchant follows ("Paypal Inst
  // Xfer <merchant>" / "Paypal *<merchant>"). Known merchants are caught by the
  // keyword rules above; anything else is most likely a purchase, so suggest
  // online shopping (kept in review to confirm/refine).
  if (/paypal\s*\*|paypal\b.*inst xfer/.test(s)) return { slug: 'outflows-shopping-online_shopping', confidence: 'low' };

  return null;
}
