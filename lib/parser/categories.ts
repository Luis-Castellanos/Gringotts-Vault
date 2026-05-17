// lib/parser/categories.ts

/**
 * Categorization rules. Order matters — first match wins.
 *
 * Ported from the Python skill's RULES array. Keep in sync with
 * the Python version during the side-by-side validation period.
 */

export type CategoryRule = {
  category: string;
  subcategory: string;
  keywords: string[];
};

export const RULES: CategoryRule[] = [
  // Apple-specific cashback claw-back. Must come before the RETURN rule below
  // because Daily Cash Adjustment lines never contain "RETURN" but they're
  // related to refund handling.
  { category: 'Fees & Charges', subcategory: 'Cashback Adjustment',
    keywords: ['DAILY CASH ADJUSTMENT'] },

  // Refunds — checked before any merchant rule so refund context wins.
  { category: 'Income', subcategory: 'Refund',
    keywords: ['RETURN'] },

  { category: 'Financial', subcategory: 'Credit Card Payment',
    keywords: ['ACH DEPOSIT INTERNET TRANSFER', 'APPLE CASH PAYMENT'] },

  { category: 'Food & Dining', subcategory: 'Restaurants',
    keywords: ['CHIPOTLE', 'SHAKEYS', 'PORTOS BAKERY', 'BIG MAMAS', "DANIEL'S TACOS",
              'BROTHERS SANDWICH', 'ORIGINAL M', 'ORIGINAL MARTINOS', 'HAAGEN DAZS'] },

  { category: 'Food & Dining', subcategory: 'Fast Food',
    keywords: ['HABIT', 'JAMBA JUICE', 'BASKIN', 'POPEYES', 'PAPA JOHN', 'MCDONALD',
              'LITTLE CAESAR', 'SUBWAY'] },

  { category: 'Food & Dining', subcategory: 'Coffee & Tea',
    keywords: ['STARBUCKS'] },

  { category: 'Food & Dining', subcategory: 'Delivery',
    keywords: ['POSTMATES', 'DOORDASH', 'UBER EATS', 'GRUBHUB'] },

  { category: 'Food & Dining', subcategory: 'Groceries',
    keywords: ['VONS', 'WHOLEFDS', 'WHOLE FOODS', 'SUN VALLEY GROCERY',
              'SMART AND FINAL', 'TRADER JOE'] },

  { category: 'Transportation', subcategory: 'Fuel',
    keywords: ['SHELL OIL', 'CHEVRON', 'ARCO', '76 STATION', 'SUN VALLEY PETRO', 'FASTRIP'] },

  { category: 'Health & Fitness', subcategory: 'Health',
    keywords: ['CVS/PHARMACY', 'WALGREENS', 'SMILEDIRECTCLUB'] },

  { category: 'Shopping', subcategory: 'Clothing',
    keywords: ['NIKE.COM', 'ADIDAS', 'LULULEMON', 'ALLBIRDS', 'GYMSHARK', 'CHAMPS SPORTS',
              'TINMAN ELITE', 'BOWERMAN TC'] },

  { category: 'Shopping', subcategory: 'Electronics',
    keywords: ['BEST BUY', 'BESTBUY.COM', 'WHOOP', 'APPLE ONLINE STORE', 'FISHSKYN',
              'SP * LOGIC SHOP', 'LOGIC SHOP'] },

  { category: 'Shopping', subcategory: 'Home Goods',
    keywords: ['WAYFAIR', 'BELLROY', 'PAKT INC', 'TARGET'] },

  { category: 'Shopping', subcategory: 'General Merchandise',
    keywords: ['AMAZON.COM', 'AMZN MKTP', 'AMZ*WOOT', 'WALMART', 'COSTCO',
              'EBAY INC', 'PAYPAL', 'OFFERUP', 'ORDER.WISH.COM', 'ETSY.COM'] },

  { category: 'Shopping', subcategory: 'Online Shopping',
    keywords: ['KINDLE SVCS', 'CRAIGSLIST', 'PP*FERN', 'SQ *', 'TST*', 'AMZ*',
              'ATWIIKS', 'PLAYBOOK', 'CSBOOKS'] },

  { category: 'Subscriptions & Software', subcategory: 'Streaming',
    keywords: ['PRIME VIDEO', 'NETFLIX', 'HULU', 'SPOTIFY', 'YOUTUBEPREMIUM',
              'DISNEY+', 'HBO', 'TRAKT.TV'] },

  { category: 'Subscriptions & Software', subcategory: 'Software & SaaS',
    keywords: ['APPLE.COM/BILL', 'ICLOUD', 'ADOBE CREATIVE', 'GOOGLE *',
              'CERCUBE APP', 'SP * SENSEI', 'SP * YOGSCAST', 'SP * SEEKDISCOMFORT'] },

  { category: 'Subscriptions & Software', subcategory: 'News & Media',
    keywords: ['QUARTZ', 'NYT', 'NEW YORK TIMES', 'WSJ'] },

  { category: 'Education', subcategory: 'Tuition & Fees',
    keywords: ['GLENDALE COMM COLLEGE', 'CSU BAKERSFIELD', 'ENTERTAINMENTCAREERS'] },

  { category: 'Bills & Utilities', subcategory: 'Utilities',
    keywords: ['CITY OF LA DWP', 'DWP'] },
];

/**
 * Returns the (category, subcategory) for a given description by walking
 * RULES in order. Returns ('Uncategorized', 'Review') if nothing matches.
 *
 * Description normalization: collapse whitespace, uppercase. Mirrors the
 * Python implementation exactly.
 */
export function categorize(description: string): { category: string; subcategory: string } {
  const normalized = description.replace(/\s+/g, ' ').trim().toUpperCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw)) {
        return { category: rule.category, subcategory: rule.subcategory };
      }
    }
  }
  return { category: 'Uncategorized', subcategory: 'Review' };
}
