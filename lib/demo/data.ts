/**
 * Demo fixture generator — PURE (no DB). Builds a self-consistent ~14-month
 * financial picture with explicit UUIDs so relations resolve at insert time.
 * Account balances in Vault derive from SUM(transactions), so each non-operating
 * account gets one isTransfer "opening balance" row equal to its starting value
 * (kept out of income/spend reports), and operating accounts build up from
 * paychecks/expenses. Category assignment is by slug, resolved against the DB.
 */

import { randomUUID } from 'crypto';
import type { TaxWorkspace } from '@/lib/tax-engine';
import { defaultWorkspace } from '@/lib/tax-engine';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jit = (base: number, pct = 0.15) => Math.round(base * (1 + (Math.random() * 2 - 1) * pct));

export type DemoAccount = {
  id: string;
  name: string;
  type: string;
  assetClass: 'asset' | 'liability';
  institution?: string;
  accountNumber?: string;
  openedAt?: string;
  creditLimit?: number;
  apr?: number;
  apy?: number;
  interestRate?: number;
  monthlyPayment?: number;
  originalPrincipal?: number;
  maturityDate?: string;
  accountSubtype?: string;
  signupBonus?: { amount: number; type: string; valuationCents: number; spendRequired: number; spendDeadline: string };
  benefits?: string[];
};

export type DemoTxn = {
  id: string;
  accountId: string;
  categorySlug: string | null;
  propertyId?: string;
  date: string;
  amount: number;
  merchant: string;
  raw: string;
  isTransfer?: boolean;
  transferPairId?: string;
};

export type DemoHolding = { id: string; accountId: string; symbol: string | null; name: string; assetClass: string; quantity: number; costBasis: number; statementPrice: number; statementValue: number; asOf: string };
export type DemoProperty = { id: string; name: string; street: string; city: string; state: string; zip: string; propertyType: string; useType: string; propertyTaxAnnual: number; insuranceAnnual: number; beds: number; baths: number; sqft: number; acquisitionDate: string; acquisitionPrice: number; landValuePct: number; marketValue: number; mortgageAccountId?: string; escrowAccountId?: string };
export type DemoLease = { id: string; propertyId: string; unit: string | null; tenantName: string; tenantContact: string; rentAmount: number; depositAmount: number; startDate: string; endDate: string; status: string };
export type DemoMaintenance = { id: string; propertyId: string; title: string; status: string; category: string; vendor: string; cost: number; openedAt: string; completedAt: string | null };
export type DemoCapex = { id: string; propertyId: string; description: string; cost: number; placedInService: string; usefulLifeYears: number };
export type DemoPaystub = { id: string; payDate: string; payPeriod: string; voucher: string; employer: string; gross: number; net: number; deductionsTotal: number; taxesTotal: number; employerTotal: number; hours: number; earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[]; taxes: { label: string; amount: number }[]; employerContributions: { label: string; amount: number }[] };
export type DemoGoal = { id: string; name: string; type: string; targetAmount: number | null; targetDate: string; monthlyContribution: number; growthRatePct?: number; icon?: string; color?: string; accountIds: string[] };

export type DemoData = {
  accounts: DemoAccount[];
  transactions: DemoTxn[];
  holdings: DemoHolding[];
  properties: DemoProperty[];
  leases: DemoLease[];
  maintenance: DemoMaintenance[];
  capex: DemoCapex[];
  paystubs: DemoPaystub[];
  goals: DemoGoal[];
  taxWorkspace: TaxWorkspace;
  profile: { name: string; navHidden: string[] };
};

export function buildDemoData(): DemoData {
  const today = new Date();
  const startMonths = 14;
  const windowStart = new Date(today.getFullYear(), today.getMonth() - startMonths, 1);
  const openIso = isoOf(windowStart);

  // --- Accounts -----------------------------------------------------------
  const a = {
    checking: rid(),
    savings: rid(),
    cash: rid(),
    brokerage: rid(),
    k401: rid(),
    roth: rid(),
    hsa: rid(),
    escrow: rid(),
    sapphire: rid(),
    amexGold: rid(),
    appleCard: rid(),
    discover: rid(),
    mortgage: rid(),
    rentalRE: rid(),
    homeRE: rid(),
  };
  const accounts: DemoAccount[] = [
    { id: a.checking, name: 'Chase Checking', type: 'checking', assetClass: 'asset', institution: 'Chase', accountNumber: '4763', openedAt: '2019-03-01' },
    { id: a.savings, name: 'Ally Savings', type: 'savings', assetClass: 'asset', institution: 'Ally Bank', accountNumber: '9491', apy: 4.2 },
    { id: a.cash, name: 'Apple Cash', type: 'cash', assetClass: 'asset', institution: 'Apple / Green Dot Bank' },
    { id: a.brokerage, name: 'Fidelity Brokerage', type: 'brokerage', assetClass: 'asset', institution: 'Fidelity', accountSubtype: 'Individual' },
    { id: a.k401, name: 'Fidelity 401(k)', type: '401k', assetClass: 'asset', institution: 'Fidelity', accountSubtype: 'Traditional' },
    { id: a.roth, name: 'Vanguard Roth IRA', type: 'roth_ira', assetClass: 'asset', institution: 'Vanguard' },
    { id: a.hsa, name: 'Fidelity HSA', type: 'hsa', assetClass: 'asset', institution: 'Fidelity' },
    { id: a.escrow, name: 'Mortgage Escrow', type: 'cash', assetClass: 'asset', institution: 'Rocket Mortgage' },
    { id: a.sapphire, name: 'Chase Sapphire Reserve', type: 'credit_card', assetClass: 'liability', institution: 'Chase', accountNumber: '0173', creditLimit: 30_000, apr: 22.99,
      signupBonus: { amount: 60_000, type: 'points', valuationCents: 2, spendRequired: 4_000, spendDeadline: '2025-09-30' },
      benefits: ['$300 annual travel credit', 'Priority Pass lounge access', '3x dining & travel', 'Primary rental car insurance'] },
    { id: a.amexGold, name: 'Amex Gold', type: 'credit_card', assetClass: 'liability', institution: 'American Express', accountNumber: '1001', creditLimit: 25_000, apr: 24.49,
      benefits: ['4x dining & groceries', '$120 dining credit', '$120 Uber Cash'] },
    { id: a.appleCard, name: 'Apple Card', type: 'credit_card', assetClass: 'liability', institution: 'Goldman Sachs / Apple', accountNumber: '7999', creditLimit: 8_000, apr: 19.99, benefits: ['3% Apple purchases', '2% Apple Pay'] },
    { id: a.discover, name: 'Discover It Card', type: 'credit_card', assetClass: 'liability', institution: 'Discover', accountNumber: '6586', creditLimit: 12_000, apr: 21.49, benefits: ['5% rotating categories', 'Cashback Match'] },
    { id: a.mortgage, name: 'Home Mortgage', type: 'mortgage', assetClass: 'liability', institution: 'Rocket Mortgage', originalPrincipal: 420_000, interestRate: 6.125, monthlyPayment: 2_900, maturityDate: '2053-06-01', openedAt: '2023-06-01' },
    { id: a.rentalRE, name: '123 Oak Street (Rental)', type: 'real_estate', assetClass: 'asset' },
    { id: a.homeRE, name: '456 Maple Ave (Home)', type: 'real_estate', assetClass: 'asset' },
  ];

  const txns: DemoTxn[] = [];
  const tx = (t: Omit<DemoTxn, 'id'> & { id?: string }) => { const row = { id: t.id ?? rid(), ...t }; txns.push(row); return row; };
  const opening = (accountId: string, amount: number, label: string) => tx({ accountId, categorySlug: null, date: openIso, amount, merchant: label, raw: label, isTransfer: true });
  const transfer = (from: string, to: string, amount: number, date: string, label: string) => {
    const outId = rid(); const inId = rid();
    tx({ id: outId, accountId: from, categorySlug: null, date, amount: -Math.abs(amount), merchant: label, raw: label, isTransfer: true, transferPairId: inId });
    tx({ id: inId, accountId: to, categorySlug: null, date, amount: Math.abs(amount), merchant: label, raw: label, isTransfer: true, transferPairId: outId });
  };

  // Opening balances (non-operating accounts == their current value).
  opening(a.checking, 4_000, 'Opening balance');
  opening(a.savings, 15_000, 'Opening balance');
  opening(a.cash, 500, 'Opening balance');
  opening(a.brokerage, 142_000, 'Opening balance');
  opening(a.k401, 210_000, 'Opening balance');
  opening(a.roth, 48_000, 'Opening balance');
  opening(a.hsa, 9_500, 'Opening balance');
  opening(a.escrow, 1_200, 'Opening balance');
  opening(a.mortgage, -395_000, 'Mortgage balance');
  opening(a.rentalRE, 520_000, 'Property value — 123 Oak Street');
  opening(a.homeRE, 680_000, 'Property value — 456 Maple Ave');

  // --- Recurring monthly + weekly activity --------------------------------
  const card = () => [a.sapphire, a.amexGold, a.appleCard, a.discover][Math.floor(Math.random() * 4)]!;
  const monthCount = startMonths + 1;
  for (let i = 0; i < monthCount; i++) {
    const y = windowStart.getFullYear();
    const mo = windowStart.getMonth() + i;
    const monthDate = new Date(y, mo, 1);
    const yy = monthDate.getFullYear();
    const mm = monthDate.getMonth();
    const day = (d: number) => isoOf(new Date(yy, mm, Math.min(d, 28)));
    const future = (d: number) => new Date(yy, mm, d) > today;
    if (new Date(yy, mm, 1) > today) break;

    // Housing
    if (!future(1)) tx({ accountId: a.checking, categorySlug: 'outflows-housing-mortgage', date: day(1), amount: -2_200, merchant: 'Rocket Mortgage', raw: 'ROCKET MORTGAGE PYMT' });
    if (!future(1)) transfer(a.checking, a.escrow, 700, day(1), 'Escrow contribution');
    // Utilities & subscriptions
    if (!future(12)) tx({ accountId: a.checking, categorySlug: 'outflows-bills_utilities-utilities', date: day(12), amount: -jit(165), merchant: 'PG&E', raw: 'PG&E AUTOPAY' });
    if (!future(15)) tx({ accountId: a.checking, categorySlug: 'outflows-bills_utilities-internet_mobile', date: day(15), amount: -80, merchant: 'Xfinity', raw: 'COMCAST XFINITY' });
    if (!future(18)) tx({ accountId: a.appleCard, categorySlug: 'outflows-bills_utilities-phone', date: day(18), amount: -90, merchant: 'Verizon', raw: 'VERIZON WIRELESS' });
    if (!future(3)) tx({ accountId: a.appleCard, categorySlug: 'outflows-bills_utilities-streaming', date: day(3), amount: -23, merchant: 'Netflix', raw: 'NETFLIX.COM' });
    if (!future(5)) tx({ accountId: a.appleCard, categorySlug: 'outflows-bills_utilities-streaming', date: day(5), amount: -12, merchant: 'Spotify', raw: 'SPOTIFY USA' });
    if (!future(8)) tx({ accountId: a.sapphire, categorySlug: 'outflows-health_wellness-gym_fitness', date: day(8), amount: -45, merchant: 'Equinox', raw: 'EQUINOX' });
    // Insurance
    if (!future(20)) tx({ accountId: a.checking, categorySlug: 'outflows-auto_transport-auto_insurance', date: day(20), amount: -148, merchant: 'GEICO', raw: 'GEICO AUTO' });
    // Transfers: to savings + savings interest
    if (!future(2)) transfer(a.checking, a.savings, 800, day(2), 'Auto-save');
    if (!future(28)) tx({ accountId: a.savings, categorySlug: 'inflows-investment_income-interest', date: day(28), amount: jit(70, 0.1), merchant: 'Ally Bank', raw: 'INTEREST PAID' });
    // Rental income + expenses (tagged to the rental property)
    if (!future(5)) tx({ accountId: a.checking, categorySlug: 'inflows-other_inflows', propertyId: a.rentalRE, date: day(5), amount: 2_400, merchant: 'Tenant — Jordan V.', raw: 'RENT PAYMENT ZELLE' });
    if (!future(6)) tx({ accountId: a.checking, categorySlug: 'outflows-housing-repairs_maintenance', propertyId: a.rentalRE, date: day(6), amount: -200, merchant: 'Oak St Property Mgmt', raw: 'PROPERTY MANAGEMENT' });

    // Weekly discretionary on cards (4 weeks)
    for (let w = 0; w < 4; w++) {
      const d = 4 + w * 7;
      if (future(d)) continue;
      tx({ accountId: card(), categorySlug: 'outflows-food_dining-groceries', date: day(d), amount: -jit(135), merchant: ['Whole Foods', 'Trader Joe\'s', 'Safeway', 'Costco'][w % 4]!, raw: 'GROCERY' });
      tx({ accountId: card(), categorySlug: 'outflows-food_dining-restaurants', date: day(d + 1), amount: -jit(58), merchant: ['Chipotle', 'Sushi Ya', 'The Cheesecake Factory', 'Local Bistro'][w % 4]!, raw: 'RESTAURANT' });
      tx({ accountId: a.sapphire, categorySlug: 'outflows-food_dining-coffee_tea', date: day(d + 2), amount: -jit(7, 0.3), merchant: 'Starbucks', raw: 'STARBUCKS' });
      tx({ accountId: card(), categorySlug: 'outflows-auto_transport-gas_charging', date: day(d + 3), amount: -jit(55), merchant: 'Shell', raw: 'SHELL OIL' });
    }
    // Monthly shopping + entertainment
    if (!future(14)) tx({ accountId: a.amexGold, categorySlug: 'outflows-shopping-online_shopping', date: day(14), amount: -jit(95), merchant: 'Amazon', raw: 'AMZN MKTP' });
    if (!future(22)) tx({ accountId: card(), categorySlug: 'outflows-entertainment-movies', date: day(22), amount: -jit(38), merchant: 'AMC Theatres', raw: 'AMC' });

    // Cashback (small inflow on a card)
    if (!future(27)) tx({ accountId: a.discover, categorySlug: 'inflows-rewards_bonuses-credit_card_cashback_points', date: day(27), amount: jit(35, 0.4), merchant: 'Discover', raw: 'CASHBACK BONUS' });

    // Card autopay — full balance for all but Discover (which carries a balance).
    settleCard(txns, tx, transfer, a.sapphire, a.checking, yy, mm, today, 1);
    settleCard(txns, tx, transfer, a.amexGold, a.checking, yy, mm, today, 1);
    settleCard(txns, tx, transfer, a.appleCard, a.checking, yy, mm, today, 1);
    settleCard(txns, tx, transfer, a.discover, a.checking, yy, mm, today, 0.6);
  }

  // Biweekly paychecks (net deposit) + matching paystubs
  const paystubs: DemoPaystub[] = [];
  let payDate = new Date(windowStart);
  // align to a Friday
  payDate.setDate(payDate.getDate() + ((5 - payDate.getDay() + 7) % 7));
  let stub = 0;
  while (payDate <= today) {
    const dIso = isoOf(payDate);
    tx({ accountId: a.checking, categorySlug: 'inflows-wages-paycheck', date: dIso, amount: 2_520, merchant: 'Acme Corp Payroll', raw: 'ACME CORP DIRECT DEP' });
    paystubs.push({
      id: rid(), payDate: dIso, payPeriod: dIso, voucher: `DEMO-${dIso}-${stub}`, employer: 'Acme Corp',
      gross: 3_600, net: 2_520, deductionsTotal: 360, taxesTotal: 720, employerTotal: 194, hours: 80,
      earnings: [{ label: 'Regular Pay', amount: 3_600 }],
      deductions: [{ label: '401(k) Pre-tax', amount: 252 }, { label: 'Medical', amount: 108 }],
      taxes: [{ label: 'Federal Income Tax', amount: 430 }, { label: 'Social Security', amount: 201 }, { label: 'Medicare', amount: 47 }, { label: 'State Income Tax', amount: 42 }],
      employerContributions: [{ label: '401(k) Match', amount: 144 }, { label: 'HSA', amount: 50 }],
    });
    payDate = new Date(payDate); payDate.setDate(payDate.getDate() + 14); stub++;
  }

  // Quarterly dividends + annual tax refund + a couple trips
  for (let q = 0; q < 5; q++) {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + q * 3 + 1, 15);
    if (d > today) break;
    // Swept to checking so the brokerage balance stays equal to its holdings value.
    tx({ accountId: a.checking, categorySlug: 'inflows-investment_income-dividends_qualified', date: isoOf(d), amount: jit(620, 0.2), merchant: 'Fidelity', raw: 'DIVIDEND SWEEP' });
  }
  const refundDate = new Date(today.getFullYear(), 2, 20);
  if (refundDate <= today && refundDate >= windowStart) tx({ accountId: a.checking, categorySlug: 'inflows-other_inflows-tax_refund', date: isoOf(refundDate), amount: 1_840, merchant: 'IRS', raw: 'IRS TREAS 310 TAX REF' });
  const trip = (mAgo: number, flights: number, hotels: number) => {
    const d = new Date(today.getFullYear(), today.getMonth() - mAgo, 10);
    if (d < windowStart || d > today) return;
    tx({ accountId: a.sapphire, categorySlug: 'outflows-travel-flights', date: isoOf(d), amount: -flights, merchant: 'United Airlines', raw: 'UNITED AIR' });
    tx({ accountId: a.sapphire, categorySlug: 'outflows-travel-hotels', date: isoOf(new Date(today.getFullYear(), today.getMonth() - mAgo, 12)), amount: -hotels, merchant: 'Marriott', raw: 'MARRIOTT' });
  };
  trip(3, 680, 920); trip(9, 540, 760);

  // Escrow disbursements (property tax twice a year, insurance annually)
  for (const mAgo of [2, 8]) {
    const d = new Date(today.getFullYear(), today.getMonth() - mAgo, 10);
    if (d >= windowStart && d <= today) tx({ accountId: a.escrow, categorySlug: 'outflows-housing-mortgage', date: isoOf(d), amount: -3_100, merchant: 'County Tax Collector', raw: 'PROPERTY TAX' });
  }
  const insD = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  if (insD >= windowStart && insD <= today) tx({ accountId: a.escrow, categorySlug: 'outflows-housing-renters_home_insurance', date: isoOf(insD), amount: -1_800, merchant: 'State Farm', raw: 'HOMEOWNERS INS' });

  // --- Holdings (sum to each account's opening value) ---------------------
  const asOf = isoOf(today);
  const holdings: DemoHolding[] = [
    h(a.brokerage, 'VTI', 'Vanguard Total Stock Market ETF', 'etf', 220, 48_000, 295, 64_900, asOf),
    h(a.brokerage, 'VOO', 'Vanguard S&P 500 ETF', 'etf', 90, 33_000, 510, 45_900, asOf),
    h(a.brokerage, 'AAPL', 'Apple Inc.', 'equity', 80, 9_000, 228, 18_240, asOf),
    h(a.brokerage, null, 'Cash & Money Market', 'cash', 12_960, 12_960, 1, 12_960, asOf),
    h(a.k401, 'FXAIX', 'Fidelity 500 Index', 'mutual_fund', 780, 110_000, 192.3, 150_000, asOf),
    h(a.k401, 'FXNAX', 'Fidelity US Bond Index', 'mutual_fund', 4_500, 44_000, 10, 45_000, asOf),
    h(a.k401, null, 'Cash', 'cash', 15_000, 15_000, 1, 15_000, asOf),
    h(a.roth, 'VTI', 'Vanguard Total Stock Market ETF', 'etf', 163, 30_000, 295, 48_000, asOf),
    h(a.hsa, 'VTI', 'Vanguard Total Stock Market ETF', 'etf', 20, 5_000, 295, 6_000, asOf),
    h(a.hsa, null, 'Cash', 'cash', 3_500, 3_500, 1, 3_500, asOf),
  ];

  // --- Properties / leases / maintenance / capex --------------------------
  const properties: DemoProperty[] = [
    { id: a.rentalRE, name: '123 Oak Street', street: '123 Oak Street', city: 'Austin', state: 'TX', zip: '78704', propertyType: 'single_family', useType: 'investment', propertyTaxAnnual: 6_200, insuranceAnnual: 1_800, beds: 3, baths: 2, sqft: 1_650, acquisitionDate: '2021-08-15', acquisitionPrice: 410_000, landValuePct: 20, marketValue: 520_000 },
    { id: a.homeRE, name: '456 Maple Ave', street: '456 Maple Ave', city: 'Austin', state: 'TX', zip: '78745', propertyType: 'single_family', useType: 'residence', propertyTaxAnnual: 8_900, insuranceAnnual: 2_400, beds: 4, baths: 3, sqft: 2_400, acquisitionDate: '2023-06-01', acquisitionPrice: 540_000, landValuePct: 22, marketValue: 680_000, mortgageAccountId: a.mortgage, escrowAccountId: a.escrow },
  ];
  const leases: DemoLease[] = [
    { id: rid(), propertyId: a.rentalRE, unit: null, tenantName: 'Jordan Vasquez', tenantContact: 'jordan.v@email.com', rentAmount: 2_400, depositAmount: 2_400, startDate: '2024-09-01', endDate: '2025-08-31', status: 'active' },
  ];
  const maintenance: DemoMaintenance[] = [
    { id: rid(), propertyId: a.rentalRE, title: 'HVAC compressor repair', status: 'done', category: 'repair', vendor: 'CoolAir HVAC', cost: 480, openedAt: isoOf(new Date(today.getFullYear(), today.getMonth() - 4, 6)), completedAt: isoOf(new Date(today.getFullYear(), today.getMonth() - 4, 9)) },
    { id: rid(), propertyId: a.rentalRE, title: 'Annual roof inspection', status: 'open', category: 'inspection', vendor: 'Lone Star Roofing', cost: 250, openedAt: isoOf(new Date(today.getFullYear(), today.getMonth() - 1, 14)), completedAt: null },
  ];
  const capex: DemoCapex[] = [
    { id: rid(), propertyId: a.rentalRE, description: 'New water heater', cost: 1_850, placedInService: '2024-03-01', usefulLifeYears: 10 },
    { id: rid(), propertyId: a.rentalRE, description: 'Kitchen remodel', cost: 18_500, placedInService: '2022-05-01', usefulLifeYears: 15 },
  ];

  // --- Goals --------------------------------------------------------------
  const goals: DemoGoal[] = [
    { id: rid(), name: 'Emergency Fund', type: 'save_up', targetAmount: 30_000, targetDate: isoOf(new Date(today.getFullYear() + 1, today.getMonth(), 1)), monthlyContribution: 800, growthRatePct: 4, icon: '🛟', color: '#10b981', accountIds: [a.savings] },
    { id: rid(), name: 'Vacation Fund', type: 'save_up', targetAmount: 6_000, targetDate: isoOf(new Date(today.getFullYear(), today.getMonth() + 8, 1)), monthlyContribution: 400, growthRatePct: 2, icon: '🏝️', color: '#3b82f6', accountIds: [a.savings] },
    { id: rid(), name: 'Pay off Discover', type: 'pay_down', targetAmount: null, targetDate: isoOf(new Date(today.getFullYear(), today.getMonth() + 10, 1)), monthlyContribution: 500, icon: '💳', color: '#f97316', accountIds: [a.discover] },
  ];

  // --- Tax workspace (2025) ----------------------------------------------
  const ws = defaultWorkspace(2025, 'mfj');
  ws.profile = { taxpayerName: 'Demo User', spouseName: 'Alex Demo', state: 'TX', dependentsUnder17: 1, otherDependents: 0 };
  ws.documents = [
    { id: rid(), type: 'w2', label: 'Acme Corp', fields: { wages: 84_240, fedWithholding: 11_180, stateWithholding: 0 } },
    { id: rid(), type: '1099-int', label: 'Ally Bank', fields: { interest: 850, fedWithholding: 0 } },
    { id: rid(), type: '1099-div', label: 'Fidelity', fields: { ordinaryDividends: 3_200, qualifiedDividends: 2_800, capitalGainDistributions: 1_500, fedWithholding: 0 } },
    { id: rid(), type: '1099-b', label: 'Fidelity', fields: { shortTermGain: 600, longTermGain: 4_200, fedWithholding: 0 } },
    { id: rid(), type: 'schedule-c', label: 'Consulting', fields: { grossReceipts: 12_000, totalExpenses: 3_000 }, options: { isSSTB: false } },
    { id: rid(), type: 'schedule-e', label: '123 Oak Street', fields: { rents: 28_800, expenses: 9_000, depreciation: 12_000 } },
    { id: rid(), type: '1098', label: 'Rocket Mortgage', fields: { mortgageInterest: 21_000, points: 0 } },
  ];
  ws.itemized = { ...ws.itemized, stateLocalTaxes: 11_000, charitableCash: 3_000 };
  ws.payments = { estimatedPayments: 2_000, priorYearTax: 9_500, priorYearAgiOver150k: false };

  return {
    accounts, transactions: txns, holdings, properties, leases, maintenance, capex, paystubs, goals,
    taxWorkspace: ws,
    profile: { name: 'Demo User', navHidden: ['/upload'] },
  };
}

function rid() { return randomUUID(); }
function h(accountId: string, symbol: string | null, name: string, assetClass: string, quantity: number, costBasis: number, statementPrice: number, statementValue: number, asOf: string): DemoHolding {
  return { id: rid(), accountId, symbol, name, assetClass, quantity, costBasis, statementPrice, statementValue, asOf };
}

/** Pay a card from checking near the start of the next month, covering `frac` of last month's net purchases. */
function settleCard(
  all: DemoTxn[],
  _tx: (t: Omit<DemoTxn, 'id'> & { id?: string }) => DemoTxn,
  transfer: (from: string, to: string, amount: number, date: string, label: string) => void,
  cardId: string, checkingId: string, y: number, m: number, today: Date, frac: number,
) {
  const monthCharges = all
    .filter((t) => t.accountId === cardId && !t.isTransfer && t.amount < 0 && t.date.startsWith(`${y}-${pad(m + 1)}`))
    .reduce((s, t) => s + t.amount, 0);
  const pay = Math.round(Math.abs(monthCharges) * frac);
  if (pay <= 0) return;
  const payDate = new Date(y, m + 1, 3);
  if (payDate > today) return;
  transfer(checkingId, cardId, pay, isoOf(payDate), 'Card payment');
}
