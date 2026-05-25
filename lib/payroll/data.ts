/**
 * Payroll data — Phase A hardcoded stubs for the Payroll page.
 *
 * Eventually the bank-statement-extractor (Python repo) will emit paystubs
 * the same way it emits bank statements, and Vault's loader will populate a
 * `paystubs` table. Until then this file is the source of truth for the
 * Payroll page.
 */

export type Deposit = { bank: string; last4: string; amount: number };

export type Stub = {
  id: number;
  date: string;        // YYYY-MM-DD
  period: string;
  voucher: string;
  salary: number;
  bonus: number;
  rate: string;
  espp: number;
  fit: number;
  w4: 'old' | 'new';
  deposits: Deposit[];
};

export type ComputedStub = Stub & {
  gross: number;
  earnings: { salary: number; bonus: number; hours: number };
  deductions: {
    preTax: { k401: number; fsa: number; medical: number; dental: number; vision: number; subtotal: number };
    postTax: { espp: number; subtotal: number };
    total: number;
  };
  taxes: { fit: number; fica: number; med: number; state: number; total: number };
  net: number;
  employer: {
    k401Match: number; health: number; dental: number; ltd: number; gtli: number;
    fica: number; medicare: number; futa: number; suta: number; total: number;
  };
  imputed: { ltd: number; gtli: number; total: number };
};

export type EventTone = 'green' | 'blue' | 'purple' | 'amber' | 'red';
export type PayrollEvent = { stubDate: string; label: string; tone: EventTone; desc: string };

export const STUBS: Stub[] = [
  { id: 1,  date: '2025-01-31', period: 'Jan 1 – Jan 31, 2025',  voucher: 'CBZ-25-001', salary: 5750.00, bonus: 0,    rate: '$69,000 / yr', espp: 0,    fit: 612.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'Ally',last4:'0892',amount:600.62}] },
  { id: 2,  date: '2025-02-28', period: 'Feb 1 – Feb 28, 2025',  voucher: 'CBZ-25-002', salary: 5750.00, bonus: 0,    rate: '$69,000 / yr', espp: 0,    fit: 612.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'Ally',last4:'0892',amount:600.62}] },
  { id: 3,  date: '2025-03-31', period: 'Mar 1 – Mar 31, 2025',  voucher: 'CBZ-25-003', salary: 5750.00, bonus: 1880, rate: '$69,000 / yr', espp: 0,    fit: 925.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3500},{bank:'Ally',last4:'0892',amount:1417.12}] },
  { id: 4,  date: '2025-04-30', period: 'Apr 1 – Apr 30, 2025',  voucher: 'CBZ-25-004', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3500},{bank:'Ally',last4:'0892',amount:455.92}] },
  { id: 5,  date: '2025-05-31', period: 'May 1 – May 31, 2025',  voucher: 'CBZ-25-005', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3500},{bank:'Ally',last4:'0892',amount:455.92}] },
  { id: 6,  date: '2025-06-30', period: 'Jun 1 – Jun 30, 2025',  voucher: 'CBZ-25-006', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'US Bank',last4:'7715',amount:955.92}] },
  { id: 7,  date: '2025-07-31', period: 'Jul 1 – Jul 31, 2025',  voucher: 'CBZ-25-007', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'US Bank',last4:'7715',amount:955.92}] },
  { id: 8,  date: '2025-08-31', period: 'Aug 1 – Aug 31, 2025',  voucher: 'CBZ-25-008', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'US Bank',last4:'7715',amount:955.92}] },
  { id: 9,  date: '2025-09-30', period: 'Sep 1 – Sep 30, 2025',  voucher: 'CBZ-25-009', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 698.00, w4: 'old', deposits: [{bank:'Chase',last4:'4471',amount:3000},{bank:'US Bank',last4:'7715',amount:955.92}] },
  { id: 10, date: '2025-10-31', period: 'Oct 1 – Oct 31, 2025',  voucher: 'CBZ-25-010', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 108.00, w4: 'new', deposits: [{bank:'Chase',last4:'4471',amount:2500},{bank:'Capital One',last4:'3308',amount:2045.92}] },
  { id: 11, date: '2025-11-30', period: 'Nov 1 – Nov 30, 2025',  voucher: 'CBZ-25-011', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 108.00, w4: 'new', deposits: [{bank:'Chase',last4:'4471',amount:2500},{bank:'Capital One',last4:'3308',amount:2045.92}] },
  { id: 12, date: '2025-12-31', period: 'Dec 1 – Dec 31, 2025',  voucher: 'CBZ-25-012', salary: 6250.00, bonus: 0,    rate: '$75,000 / yr', espp: 0,    fit: 108.00, w4: 'new', deposits: [{bank:'Chase',last4:'4471',amount:2500},{bank:'Capital One',last4:'3308',amount:2045.92}] },
  { id: 13, date: '2026-04-30', period: 'Apr 1 – Apr 30, 2026',  voucher: 'CBZ-26-004', salary: 6875.00, bonus: 0,    rate: '$82,500 / yr', espp: 687.50, fit: 448.00, w4: 'new', deposits: [{bank:'Chase',last4:'4471',amount:2000},{bank:'Ally',last4:'0892',amount:1000},{bank:'Capital One',last4:'3308',amount:500},{bank:'Bank of America',last4:'1148',amount:660.30}] },
];

export const EVENTS: PayrollEvent[] = [
  { stubDate: '2025-03-31', label: 'Annual bonus', tone: 'purple', desc: '+$1,880 supplemental' },
  { stubDate: '2025-04-30', label: 'Raise',         tone: 'green',  desc: '$69K → $75K' },
  { stubDate: '2025-10-31', label: 'W4 updated',    tone: 'amber',  desc: 'Dep claim $0 → $7,097' },
  { stubDate: '2026-04-30', label: 'Raise + ESPP',  tone: 'blue',   desc: '$82.5K · 10% ESPP active' },
];

export function computeStub(s: Stub): ComputedStub {
  const gross = s.salary + s.bonus;

  const k401   = +(s.salary * 0.06).toFixed(2);
  const fsa    = 275.00;
  const medical = 185.00;
  const dental  = 25.00;
  const vision  = 8.00;
  const preTax = +(k401 + fsa + medical + dental + vision).toFixed(2);

  const espp   = s.espp;
  const postTax = espp;

  const taxable = +(gross - preTax).toFixed(2);

  const fit    = s.fit + (s.bonus > 0 ? +(s.bonus * 0.22).toFixed(2) : 0);
  const ssWageBase = Math.min(taxable, 168600 / 12);
  const fica   = +(ssWageBase * 0.062).toFixed(2);
  const med    = +(taxable * 0.0145).toFixed(2);
  const state  = +(taxable * 0.032).toFixed(2);
  const taxesTotal = +(fit + fica + med + state).toFixed(2);

  const net = +(gross - preTax - postTax - taxesTotal).toFixed(2);

  const eMatch   = +(s.salary * 0.03).toFixed(2);
  const eHealth  = 625.00;
  const eDental  = 40.00;
  const eLTD     = 25.00;
  const eGTLI    = 8.40;
  const eFUTA    = 4.20;
  const eSUTA    = 35.00;
  const employerTotal = +(eMatch + eHealth + eDental + eLTD + eGTLI + fica + med + eFUTA + eSUTA).toFixed(2);

  const imputedLTD  = 25.00;
  const imputedGTLI = 8.40;

  return {
    ...s,
    gross,
    earnings: { salary: s.salary, bonus: s.bonus, hours: 173.33 },
    deductions: {
      preTax: { k401, fsa, medical, dental, vision, subtotal: preTax },
      postTax: { espp, subtotal: postTax },
      total: +(preTax + postTax).toFixed(2),
    },
    taxes: { fit, fica, med, state, total: taxesTotal },
    net,
    employer: {
      k401Match: eMatch, health: eHealth, dental: eDental,
      ltd: eLTD, gtli: eGTLI, fica: fica, medicare: med,
      futa: eFUTA, suta: eSUTA, total: employerTotal,
    },
    imputed: { ltd: imputedLTD, gtli: imputedGTLI, total: +(imputedLTD + imputedGTLI).toFixed(2) },
  };
}

export type YTD = {
  year: number;
  stubCount: number;
  stubs: ComputedStub[];
  gross: number; net: number;
  taxesYours: number; taxesEmployer: number;
  deductionsTotal: number; deductionsPreTax: number; deductionsPostTax: number;
  employerBenefits: number; employerTotal: number;
  bonus: number; espp: number;
  k401Contrib: number; k401Match: number; fsa: number; medical: number;
  fit: number; fica: number; medicare: number; state: number;
  imputed: number;
};

export function computeYTD(year: number): YTD {
  const stubs = STUBS.filter((s) => s.date.startsWith(String(year))).map(computeStub);
  const sum = (fn: (s: ComputedStub) => number) => stubs.reduce((a, s) => a + fn(s), 0);
  const round = (n: number) => +n.toFixed(2);
  return {
    year,
    stubCount: stubs.length,
    stubs,
    gross: round(sum((s) => s.gross)),
    net: round(sum((s) => s.net)),
    taxesYours: round(sum((s) => s.taxes.total)),
    taxesEmployer: round(sum((s) => s.employer.fica + s.employer.medicare + s.employer.futa + s.employer.suta)),
    deductionsTotal: round(sum((s) => s.deductions.total)),
    deductionsPreTax: round(sum((s) => s.deductions.preTax.subtotal)),
    deductionsPostTax: round(sum((s) => s.deductions.postTax.subtotal)),
    employerBenefits: round(sum((s) => s.employer.k401Match + s.employer.health + s.employer.dental + s.employer.ltd + s.employer.gtli)),
    employerTotal: round(sum((s) => s.employer.total)),
    bonus: round(sum((s) => s.earnings.bonus)),
    espp: round(sum((s) => s.deductions.postTax.espp)),
    k401Contrib: round(sum((s) => s.deductions.preTax.k401)),
    k401Match: round(sum((s) => s.employer.k401Match)),
    fsa: round(sum((s) => s.deductions.preTax.fsa)),
    medical: round(sum((s) => s.deductions.preTax.medical)),
    fit: round(sum((s) => s.taxes.fit)),
    fica: round(sum((s) => s.taxes.fica)),
    medicare: round(sum((s) => s.taxes.med)),
    state: round(sum((s) => s.taxes.state)),
    imputed: round(sum((s) => s.imputed.total)),
  };
}

// Aggregate where net pay landed across a year, by destination account.
export function depositsByBankYTD(year: number): { bank: string; last4: string; total: number; pct: number }[] {
  const stubs = STUBS.filter((s) => s.date.startsWith(String(year)));
  const map = new Map<string, { bank: string; last4: string; total: number }>();
  for (const s of stubs) {
    for (const d of s.deposits) {
      const key = `${d.bank}|${d.last4}`;
      const cur = map.get(key) ?? { bank: d.bank, last4: d.last4, total: 0 };
      cur.total += d.amount;
      map.set(key, cur);
    }
  }
  const arr = [...map.values()];
  const grand = arr.reduce((s, x) => s + x.total, 0);
  return arr
    .map((x) => ({ ...x, total: +x.total.toFixed(2), pct: grand > 0 ? (x.total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

// ─── Formatters ─────────────────────────────────────────────────────────────
export function fmtMoney(n: number, { sign = false, decimals = 2 }: { sign?: boolean; decimals?: number } = {}): string {
  const prefix = sign && n > 0 ? '+' : '';
  return prefix + '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
export function fmtMoneyParts(n: number): { whole: string; cents: string } {
  const parts = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).split('.');
  return { whole: parts[0]!, cents: parts[1]! };
}
export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
export function fmtMonth(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short' });
}
