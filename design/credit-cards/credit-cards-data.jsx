// credit-cards-data.jsx — 8 active cards + 2 closed, tuned to brief.
// Total limit $87,400, total balance $3,214.40 (3.68% util) — matches the
// aggregated row on the Accounts page.

const CREDIT_CARDS = [
  // ── Signup bonus state (newest card) ───────────────────────────────
  {
    id: "amex-gold",
    name: "Gold",
    nickname: "Amex Gold",
    issuer: "American Express",
    network: "Amex",
    last4: "1006",
    art: { from: "#d4af37", to: "#8a6914" },
    limit: 20000, // "no preset"
    isNoPreset: true,
    balance: 1240.40,
    statementBalance: 1240.40,
    minPayment: 50,
    dueDate: "2026-06-05",
    closingDate: "2026-05-28",
    apr: 21.99,
    annualFee: 250,
    annualFeeDueDate: "2027-01-22",
    openedDate: "2026-04-15",
    state: "signup_bonus",
    signupBonus: {
      amount: 60000, type: "Membership Rewards points", valuationCents: 1.5,
      spendRequired: 4000, spendDeadline: "2026-07-15", spendSoFar: 1240.40,
    },
    cashbackYTD: 24.81,
    benefits: ["$120 dining credit", "$120 Uber Cash", "4× dining", "4× US supermarkets"],
    delta30: 1240.40,
  },

  // ── Annual fee due soon ────────────────────────────────────────────
  {
    id: "chase-sapphire",
    name: "Sapphire Preferred",
    nickname: "CSP",
    issuer: "Chase",
    network: "Visa",
    last4: "4471",
    art: { from: "#1e3a8a", to: "#0c1e4d" },
    limit: 12000,
    balance: 450.00,
    statementBalance: 380.42,
    minPayment: 35,
    dueDate: "2026-06-01",
    closingDate: "2026-05-25",
    apr: 21.49,
    annualFee: 95,
    annualFeeDueDate: "2026-06-30",
    openedDate: "2022-06-30",
    state: "fee_due",
    cashbackYTD: 134.20,
    benefits: ["2× travel & dining", "25% bonus on Chase Travel", "Trip cancellation"],
    delta30: 120.00,
  },

  // ── Steady state (6 of them) ───────────────────────────────────────
  {
    id: "citi-double",
    name: "Double Cash",
    issuer: "Citi",
    network: "Mastercard",
    last4: "8842",
    art: { from: "#0e7490", to: "#155e75" },
    limit: 14000,
    balance: 1180.00,
    statementBalance: 980.00,
    minPayment: 30,
    dueDate: "2026-06-08",
    closingDate: "2026-06-01",
    apr: 22.99,
    annualFee: 0,
    openedDate: "2021-03-12",
    state: "steady",
    cashbackYTD: 187.45,
    benefits: ["2% on everything (1% buy + 1% pay)"],
    delta30: -210.50,
  },
  {
    id: "discover-it",
    name: "it Cash Back",
    issuer: "Discover",
    network: "Discover",
    last4: "5521",
    art: { from: "#ea580c", to: "#9a3412" },
    limit: 9000,
    balance: 325.00,
    statementBalance: 325.00,
    minPayment: 30,
    dueDate: "2026-06-15",
    closingDate: "2026-06-08",
    apr: 17.99,
    annualFee: 0,
    openedDate: "2020-11-04",
    state: "steady",
    cashbackYTD: 86.32,
    benefits: ["5% rotating", "1% otherwise", "First-year cashback match"],
    delta30: -45.00,
  },
  {
    id: "chase-freedom-unl",
    name: "Freedom Unlimited",
    issuer: "Chase",
    network: "Visa",
    last4: "9933",
    art: { from: "#2563eb", to: "#1d4ed8" },
    limit: 8500,
    balance: 0,
    statementBalance: 0,
    minPayment: 0,
    dueDate: null,
    closingDate: "2026-05-26",
    apr: 19.99,
    annualFee: 0,
    openedDate: "2023-01-18",
    state: "steady",
    cashbackYTD: 28.40,
    benefits: ["1.5% on everything", "5% on travel via Chase"],
    delta30: 0,
  },
  {
    id: "amex-bce",
    name: "Blue Cash Everyday",
    issuer: "American Express",
    network: "Amex",
    last4: "7011",
    art: { from: "#3b82f6", to: "#1e40af" },
    limit: 5500,
    balance: 0,
    statementBalance: 0,
    minPayment: 0,
    dueDate: null,
    closingDate: "2026-05-30",
    apr: 18.99,
    annualFee: 0,
    openedDate: "2023-09-22",
    state: "steady",
    cashbackYTD: 12.40,
    benefits: ["3% groceries (cap $6K)", "3% gas (cap $6K)", "3% online retail"],
    delta30: 0,
  },
  {
    id: "cap1-quicksilver",
    name: "Quicksilver",
    issuer: "Capital One",
    network: "Visa",
    last4: "3308",
    art: { from: "#dc2626", to: "#7f1d1d" },
    limit: 7500,
    balance: 0,
    statementBalance: 0,
    minPayment: 0,
    dueDate: null,
    closingDate: "2026-06-02",
    apr: 20.49,
    annualFee: 0,
    openedDate: "2022-08-15",
    state: "steady",
    cashbackYTD: 0,
    benefits: ["1.5% on everything"],
    delta30: 0,
  },
  {
    id: "boa-ccr",
    name: "Customized Cash Rewards",
    issuer: "Bank of America",
    network: "Visa",
    last4: "1148",
    art: { from: "#b91c1c", to: "#450a0a" },
    limit: 10900,
    balance: 19.00,
    statementBalance: 19.00,
    minPayment: 25,
    dueDate: "2026-06-12",
    closingDate: "2026-06-05",
    apr: 19.99,
    annualFee: 0,
    openedDate: "2024-02-20",
    state: "steady",
    cashbackYTD: 5.80,
    benefits: ["3% choice category", "2% groceries/wholesale", "1% otherwise"],
    delta30: 19.00,
  },

  // ── Closed cards (separate tab) ────────────────────────────────────
  {
    id: "old-discover",
    name: "Cashback Bonus",
    issuer: "Discover",
    network: "Discover",
    last4: "0021",
    art: { from: "#94a3b8", to: "#64748b" },
    limit: 0, balance: 0, apr: 0, annualFee: 0,
    openedDate: "2018-05-04",
    closedDate: "2023-06-15",
    cashbackYTD: 0,
    closed: true,
  },
  {
    id: "old-cap1",
    name: "Platinum",
    issuer: "Capital One",
    network: "Visa",
    last4: "7702",
    art: { from: "#94a3b8", to: "#64748b" },
    limit: 0, balance: 0, apr: 0, annualFee: 0,
    openedDate: "2019-09-12",
    closedDate: "2024-04-22",
    cashbackYTD: 0,
    closed: true,
  },
];

function ccSummary(cards) {
  const active = cards.filter(c => !c.closed);
  const totalLimit   = active.reduce((s, c) => s + c.limit, 0);
  const totalBalance = active.reduce((s, c) => s + c.balance, 0);
  const cashbackYTD  = active.reduce((s, c) => s + (c.cashbackYTD || 0), 0);
  const annualFees   = active.reduce((s, c) => s + (c.annualFee || 0), 0);
  const delta30      = active.reduce((s, c) => s + (c.delta30 || 0), 0);
  return {
    cardCount: active.length,
    totalLimit, totalBalance,
    util: totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0,
    cashbackYTD,
    annualFees,
    netCashback: cashbackYTD - annualFees,
    delta30,
    available: totalLimit - totalBalance,
  };
}

function utilTone(pct) {
  if (pct <= 30) return "green";
  if (pct <= 50) return "amber";
  return "red";
}

// Days between two ISO dates (positive if to > from)
function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
const TODAY = "2026-05-19";

Object.assign(window, { CREDIT_CARDS, ccSummary, utilTone, daysBetween, TODAY });
