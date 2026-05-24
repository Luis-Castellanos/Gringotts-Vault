// accounts-data.jsx — synthetic accounts tuned to the Vault brief profile.
// $82.5K salary (raised Mar 2026), ESPP started Mar 2026, multi-destination
// payroll, OH resident, CBIZ employer.

const ACCOUNTS = [
  // ── Cash / checking ────────────────────────────────────────────────
  { id: "chase-chk",  type: "checking", name: "Chase Total Checking",   institution: "Chase",            last4: "4471", balance:  8204.12, delta30:  -340.18, lastActivity: "2026-05-17", apy: 0.01,  primary: true },
  { id: "ally-chk",   type: "checking", name: "Ally Interest Checking", institution: "Ally Bank",        last4: "0892", balance:  4528.40, delta30:   215.60, lastActivity: "2026-05-15", apy: 0.25 },
  { id: "cap1-360",   type: "checking", name: "Capital One 360",        institution: "Capital One",      last4: "3308", balance:  3214.55, delta30:   500.00, lastActivity: "2026-05-12", apy: 0.10 },
  { id: "boa-chk",    type: "checking", name: "BoA Advantage Plus",     institution: "Bank of America", last4: "1148", balance:  1182.30, delta30:   660.30, lastActivity: "2026-05-15", apy: 0.01 },
  { id: "usbank-chk", type: "checking", name: "US Bank Easy Checking",  institution: "U.S. Bank",        last4: "7715", balance:  1820.00, delta30:     0.00, lastActivity: "2025-09-30", apy: 0.01, dormant: true },

  // ── Savings / HYSA ─────────────────────────────────────────────────
  { id: "ally-sav",   type: "savings",  name: "Ally Online Savings",    institution: "Ally Bank",        last4: "0892", balance: 32418.77, delta30:   822.10, lastActivity: "2026-05-01", apy: 4.40 },
  { id: "marcus",     type: "savings",  name: "Marcus Online Savings",  institution: "Goldman Sachs",    last4: "7820", balance: 18204.32, delta30:   500.00, lastActivity: "2026-05-01", apy: 4.50 },

  // ── Credit cards (aggregate; full detail on Credit Cards page) ─────
  { id: "cc-summary", type: "credit_summary", name: "Credit cards",     institution: "8 cards",          last4: null,   balance: -3214.40, delta30:  -612.30, lastActivity: "2026-05-18", cardCount: 8, totalLimit: 87400, availableCredit: 84185.60, util: 3.7 },

  // ── Brokerage / taxable ────────────────────────────────────────────
  { id: "fid-tax",    type: "brokerage", name: "Fidelity Individual",   institution: "Fidelity",         last4: "2240", balance: 24812.55, delta30:  1240.20, lastActivity: "2026-05-16", gainAmt: 2148.30, gainPct: 9.48, gainYTD: 2148.30 },

  // ── Retirement ─────────────────────────────────────────────────────
  { id: "cbiz-401k",  type: "retirement", name: "CBIZ 401(k)",          institution: "Vanguard",         last4: null,   balance: 28456.10, delta30:   915.45, lastActivity: "2026-04-30", gainAmt: 3148.10, gainPct: 12.4, contribYTD: 1375.00, matchYTD: 687.50 },
  { id: "roth-ira",   type: "retirement", name: "Roth IRA",             institution: "Fidelity",         last4: "8821", balance: 14210.00, delta30:   612.40, lastActivity: "2026-05-01", gainAmt: 1810.00, gainPct: 14.6 },
  { id: "rollover",   type: "retirement", name: "Rollover IRA",         institution: "Fidelity",         last4: "8822", balance:  9812.50, delta30:   408.20, lastActivity: "2026-05-01", gainAmt: 1212.50, gainPct: 14.1 },

  // ── ESPP ───────────────────────────────────────────────────────────
  { id: "espp",       type: "espp",       name: "CBIZ ESPP",            institution: "E*TRADE",         last4: "5510", balance:  1387.50, delta30:   687.50, lastActivity: "2026-04-30", gainAmt: 137.50, gainPct: 11.0, discount: 10, periodEnds: "2026-08-31" },

  // ── Crypto ─────────────────────────────────────────────────────────
  { id: "coinbase",   type: "crypto",     name: "Coinbase",             institution: "Coinbase",        last4: null,   balance:  2104.80, delta30:  -180.40, lastActivity: "2026-05-12", gainAmt: -380.20, gainPct: -15.3 },

  // ── Loans (negative side of NW) ────────────────────────────────────
  { id: "nelnet",     type: "loan",       name: "Federal Student Loan", institution: "Nelnet",          last4: "9920", balance: -18412.18, delta30:  230.00, lastActivity: "2026-05-01", apy: 5.50, monthlyPayment: 230, originalBalance: 24500 },
  { id: "honda-fin",  type: "loan",       name: "Auto loan — 2023 CR-V",institution: "Honda Financial", last4: "4480", balance: -11240.00, delta30:  410.00, lastActivity: "2026-05-01", apy: 4.20, monthlyPayment: 410, originalBalance: 23800 },

  // ── Closed / archived (separate tab) ───────────────────────────────
  { id: "discover-ck",type: "checking",   name: "Discover Cashback Checking", institution: "Discover",   last4: "2210", balance: 0, delta30: 0, lastActivity: "2024-08-12", apy: 0, closed: true, closedDate: "2024-08-15" },
  { id: "amex-hysa",  type: "savings",    name: "Amex Personal Savings", institution: "American Express", last4: "6614", balance: 0, delta30: 0, lastActivity: "2024-11-04", apy: 0, closed: true, closedDate: "2024-11-10" },
];

const TYPE_META = {
  checking:       { label: "Checking",        tone: "blue",   asset: true,  group: "Cash" },
  savings:        { label: "Savings",         tone: "green",  asset: true,  group: "Cash" },
  credit_summary: { label: "Credit cards",    tone: "red",    asset: false, group: "Liabilities", subgroup: "Credit cards",      linkLabel: "Full detail on Credit Cards →" },
  brokerage:      { label: "Brokerage",       tone: "purple", asset: true,  group: "Investments", subgroup: "Taxable brokerage" },
  retirement:     { label: "Retirement",      tone: "purple", asset: true,  group: "Investments", subgroup: "Retirement",         locked: true },
  espp:           { label: "ESPP",            tone: "purple", asset: true,  group: "Investments", subgroup: "Taxable brokerage" },
  crypto:         { label: "Crypto",          tone: "amber",  asset: true,  group: "Investments", subgroup: "Crypto" },
  loan:           { label: "Loan",            tone: "red",    asset: false, group: "Liabilities", subgroup: "Loans" },
};

const GROUP_ORDER = ["Cash", "Investments", "Liabilities"];

// Ordered subgroups inside groups that have them (Cash is flat)
const SUBGROUP_ORDER = {
  Investments: ["Retirement", "Taxable brokerage", "Crypto"],
  Liabilities: ["Credit cards", "Loans"],
};

function summarize(accounts) {
  const active = accounts.filter(a => !a.closed);
  const sum = (pred) => active.filter(pred).reduce((s, a) => s + a.balance, 0);

  const cash = sum(a => ["checking", "savings"].includes(a.type));
  const investable = sum(a => ["brokerage", "espp", "crypto"].includes(a.type));
  const retirement = sum(a => a.type === "retirement");
  const liabilities = sum(a => ["credit_summary", "loan"].includes(a.type)); // already negative
  const netWorth = cash + investable + retirement + liabilities;
  const liquid = cash;            // truly liquid = cash only
  const investableTotal = cash + investable; // cash + non-retirement investable

  return { cash, investable, retirement, liabilities, netWorth, liquid, investableTotal };
}

const fmtMoneyA = (n, opts={}) => {
  const { sign=false, decimals=2 } = opts;
  const abs = Math.abs(n);
  const prefix = sign ? (n > 0 ? "+" : n < 0 ? "−" : "") : (n < 0 ? "−" : "");
  return prefix + "$" + abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const fmtMoneyAShort = (n) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 10_000)    return sign + "$" + (abs / 1000).toFixed(1) + "K";
  if (abs >= 1000)      return sign + "$" + (abs / 1000).toFixed(2) + "K";
  return sign + "$" + abs.toFixed(0);
};

const fmtPct = (n, opts={}) => {
  const { sign=true, decimals=2 } = opts;
  const prefix = sign && n > 0 ? "+" : "";
  return prefix + n.toFixed(decimals) + "%";
};

const fmtRelDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const now = new Date("2026-05-19T00:00:00");
  const days = Math.round((now - d) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

Object.assign(window, {
  ACCOUNTS, TYPE_META, GROUP_ORDER, SUBGROUP_ORDER,
  summarize, fmtMoneyA, fmtMoneyAShort, fmtPct, fmtRelDate,
});

// ─── Synthetic time series for the net-worth chart ────────────────────
// Deterministic, generated from a seed so re-renders are stable.
// Today's net worth ≈ $117,489 (per summarize()).

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateNWSeries(days, endValue, seed = 7) {
  const rng = seeded(seed);
  // Build a sequence of daily values that ends at endValue.
  // Start from a value that depends on horizon (longer => lower starting).
  const startMultiplier = days >= 365 ? 0.55 : days >= 180 ? 0.72 : days >= 90 ? 0.87 : days >= 30 ? 0.93 : 0.97;
  const start = endValue * startMultiplier;
  const trendStep = (endValue - start) / days;

  const out = [];
  const today = new Date("2026-05-19T00:00:00");
  let v = start;
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const noise = (rng() - 0.5) * endValue * 0.012;
    const wobble = Math.sin(i / 6) * endValue * 0.006;
    v += trendStep + noise + wobble;
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(v) });
  }
  // Force last point to be exact endValue so it matches summary tiles
  out[out.length - 1].value = endValue;
  return out;
}

// One series per range — 7D / 1M / 3M / 6M / YTD / 1Y / 2Y / All
const _todayISO = "2026-05-19";
const _ytdDays = (() => {
  const start = new Date("2026-01-01T00:00:00");
  const today = new Date(_todayISO + "T00:00:00");
  return Math.round((today - start) / (1000 * 60 * 60 * 24));
})();

const NW_SERIES = {
  "7D":  generateNWSeries(7,    117489, 10),
  "1M":  generateNWSeries(30,   117489, 11),
  "3M":  generateNWSeries(90,   117489, 12),
  "6M":  generateNWSeries(180,  117489, 13),
  "YTD": generateNWSeries(_ytdDays, 117489, 17),
  "1Y":  generateNWSeries(365,  117489, 14),
  "2Y":  generateNWSeries(730,  117489, 16),
  "All": generateNWSeries(870,  117489, 15),
};

// Build a custom-range subseries from the longest series we have
function nwSeriesForRange(fromISO, toISO) {
  const all = NW_SERIES.All;
  return all.filter(p => p.date >= fromISO && p.date <= toISO);
}

// 12-week sparkline per account, ending at its current balance
function generateSparkline(account) {
  const rng = seeded(account.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0));
  const end = account.balance;
  const startMul = account.type === "loan" ? 1.08 : (account.gainPct ?? 0) > 0 ? 0.92 : 0.97;
  const start = end * startMul;
  const steps = 12;
  const pts = [];
  let v = start;
  const trendStep = (end - start) / steps;
  for (let i = 0; i <= steps; i++) {
    const noise = (rng() - 0.5) * Math.abs(end) * 0.02;
    v += trendStep + noise;
    pts.push(v);
  }
  pts[pts.length - 1] = end;
  return pts;
}

// Group-level 30-day delta (sum of account delta30 in the group)
function groupDelta30(accounts) {
  return accounts.reduce((s, a) => s + (a.delta30 || 0), 0);
}

Object.assign(window, { NW_SERIES, nwSeriesForRange, generateSparkline, groupDelta30 });
