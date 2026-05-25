/**
 * Payroll data layer — types, pure aggregation, and formatters for the Payroll
 * page. Stubs come from the `paystubs` table (see lib/payroll/load.ts, which is
 * server-only); everything here is pure so the client component can import it.
 *
 * Line-item breakdowns (earnings/deductions/taxes/contributions/imputed) are
 * the real per-line values the parser extracted, each [{label, amount}]. They
 * are rendered dynamically — there are no hardcoded line names — and a section's
 * lines always sum to its total (the parser only stores reconciling breakdowns).
 */

export type LineItem = { label: string; amount: number };
export type Deposit = { bank: string; last4: string; amount: number };
export type TaxSettings = {
  filingStatus: string | null;
  federal: string | null;
  claimDependent: number | null;
  deduction: number | null;
  otherIncome: number | null;
  allowances: number | null;
  additionalAllowances: number | null;
  twoJobs: string | null;
  supplementalType: string | null;
};

export type Stub = {
  id: string;
  date: string; // pay date, YYYY-MM-DD
  period: string;
  voucher: string;
  employer: string;
  baseComp: number; // annualized base, e.g. 82500
  rate: string; // display form, e.g. "$82,500 / yr"
  gross: number;
  net: number;
  hours: number;
  deductionsTotal: number;
  taxesTotal: number;
  employerTotal: number;
  nonCashFringe: number;
  bonus: number; // derived from an earnings line labelled bonus/supplemental
  earnings: LineItem[];
  deductions: LineItem[];
  taxes: LineItem[];
  contributions: LineItem[]; // employer-paid
  imputed: LineItem[];
  deposits: Deposit[];
  taxSettings: TaxSettings | null; // W-4 elections
};

export type EventTone = 'green' | 'blue' | 'purple' | 'amber' | 'red';
export type PayrollEvent = { stubDate: string; label: string; tone: EventTone; desc: string };

const round = (n: number) => +n.toFixed(2);

// ─── Label prettifier ───────────────────────────────────────────────────────
// Maps the terse codes paystubs use onto readable labels. Unknown codes fall
// back to Title Case. A trailing state suffix (":CA") is surfaced as context.
const LABEL_MAP: Record<string, string> = {
  '401K': '401(k)',
  SALARY: 'Salary',
  SAL: 'Salary',
  REGULAR: 'Regular pay',
  REG: 'Regular pay',
  OT: 'Overtime',
  HOLIDAY: 'Holiday',
  PTO: 'PTO',
  BONUS: 'Bonus',
  BNSNIP: 'Bonus',
  BNS: 'Bonus',
  GIFT: 'Gift',
  SUPPLEMENTAL: 'Supplemental',
  ESPP: 'ESPP',
  MEDICAL: 'Medical',
  DENTAL: 'Dental',
  VISION: 'Vision',
  ACCDT: 'Accident',
  'CR ILLNESS': 'Critical illness',
  FHSAI: 'Health spending (FSA/HSA)',
  FSA: 'FSA — Healthcare',
  HSA: 'HSA',
  FIT: 'Federal income tax',
  FICA: 'Social Security',
  MEDI: 'Medicare',
  MEDICARE: 'Medicare',
  FUTA: 'Federal unemployment (FUTA)',
  SUTA: 'State unemployment (SUTA)',
  ETT: 'Employment training (ETT)',
  SIT: 'State income tax',
  SDI: 'State disability (SDI)',
  GTLI: 'Group term life',
  LTD: 'Long-term disability',
};

export function prettyLabel(raw: string): string {
  const m = raw.match(/^(.*?)(?::([A-Z]{2}))?$/);
  const base = (m?.[1] ?? raw).trim().toUpperCase();
  const state = m?.[2];
  const mapped =
    LABEL_MAP[base] ??
    base
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return state ? `${mapped} · ${state}` : mapped;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────
function aggregateLines(stubs: Stub[], pick: (s: Stub) => LineItem[]): LineItem[] {
  const map = new Map<string, number>();
  for (const s of stubs) for (const li of pick(s)) map.set(li.label, (map.get(li.label) ?? 0) + li.amount);
  return [...map.entries()].map(([label, amount]) => ({ label, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
}

function pickByLabel(items: LineItem[], ...needles: string[]): number {
  return round(
    items
      .filter((i) => needles.some((n) => i.label.toUpperCase().includes(n)))
      .reduce((a, i) => a + i.amount, 0),
  );
}

// Normalize a label to its bare code (drop a state suffix + punctuation), e.g.
// "ETT:CA" → "ETT", "401(k)" → "401K". Used for exact-code matching where a
// substring would over-match (e.g. "MEDI" must not catch "MEDICAL").
const codeOf = (label: string) => label.toUpperCase().split(':')[0]!.replace(/[^A-Z0-9]/g, '');
function pickByCode(items: LineItem[], ...codes: string[]): number {
  const set = new Set(codes);
  return round(items.filter((i) => set.has(codeOf(i.label))).reduce((a, i) => a + i.amount, 0));
}

// ─── YTD ──────────────────────────────────────────────────────────────────────
export type YTD = {
  year: number;
  stubCount: number;
  stubs: Stub[];
  gross: number;
  net: number;
  taxesYours: number;
  taxesEmployer: number;
  deductionsTotal: number;
  deductionsPreTax: number;
  deductionsPostTax: number;
  employerBenefits: number;
  employerTotal: number;
  bonus: number;
  espp: number;
  k401Contrib: number;
  k401Match: number;
  fsa: number;
  fit: number;
  fica: number;
  medicare: number;
  state: number;
  imputed: number;
  deductionLines: LineItem[];
  taxLines: LineItem[];
  contributionLines: LineItem[];
};

export function computeYTD(stubs: Stub[], year: number): YTD {
  const ys = stubs.filter((s) => s.date.startsWith(String(year)));
  const sum = (fn: (s: Stub) => number) => round(ys.reduce((a, s) => a + fn(s), 0));

  const deductionLines = aggregateLines(ys, (s) => s.deductions);
  const taxLines = aggregateLines(ys, (s) => s.taxes);
  const contributionLines = aggregateLines(ys, (s) => s.contributions);

  const gross = sum((s) => s.gross);
  const taxesYours = sum((s) => s.taxesTotal);
  const employerTotal = sum((s) => s.employerTotal);
  const espp = pickByLabel(deductionLines, 'ESPP');
  const fit = pickByCode(taxLines, 'FIT', 'FEDERAL');
  const fica = pickByCode(taxLines, 'FICA', 'OASDI', 'SS');
  const medicare = pickByCode(taxLines, 'MEDI', 'MEDICARE');
  const state = round(taxesYours - fit - fica - medicare); // remainder = state/local/disability
  // Employer-side payroll taxes only — exact codes so benefit "MEDICAL" isn't
  // swept in by a "MEDI" substring.
  const taxesEmployer = pickByCode(contributionLines, 'FICA', 'MEDI', 'MEDICARE', 'FUTA', 'SUTA', 'ETT', 'SDI', 'OASDI', 'SS');

  return {
    year,
    stubCount: ys.length,
    stubs: ys,
    gross,
    net: sum((s) => s.net),
    taxesYours,
    taxesEmployer,
    deductionsTotal: sum((s) => s.deductionsTotal),
    deductionsPostTax: espp,
    deductionsPreTax: round(sum((s) => s.deductionsTotal) - espp),
    employerBenefits: round(employerTotal - taxesEmployer),
    employerTotal,
    bonus: sum((s) => s.bonus),
    espp,
    k401Contrib: pickByLabel(deductionLines, '401'),
    k401Match: pickByLabel(contributionLines, '401'),
    fsa: pickByLabel(deductionLines, 'FSA', 'HSA', 'FHSA'),
    fit,
    fica,
    medicare,
    state,
    imputed: sum((s) => s.nonCashFringe),
    deductionLines,
    taxLines,
    contributionLines,
  };
}

// Aggregate where net pay landed across a year, by destination account.
export function depositsByBankYTD(stubs: Stub[], year: number): { bank: string; last4: string; total: number; pct: number }[] {
  const ys = stubs.filter((s) => s.date.startsWith(String(year)));
  const map = new Map<string, { bank: string; last4: string; total: number }>();
  for (const s of ys) {
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
    .map((x) => ({ ...x, total: round(x.total), pct: grand > 0 ? (x.total / grand) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

// Derive timeline events (raise / bonus / ESPP start / W-4 change) from
// stub-over-stub change.
export function deriveEvents(stubs: Stub[]): PayrollEvent[] {
  const ordered = [...stubs].sort((a, b) => a.date.localeCompare(b.date));
  const events: PayrollEvent[] = [];
  let prevBase: number | null = null;
  let esppSeen = false;
  let prevTax: TaxSettings | null = null;
  for (const s of ordered) {
    if (s.bonus > 0) events.push({ stubDate: s.date, label: 'Bonus', tone: 'purple', desc: `+${fmtMoney(s.bonus, { decimals: 0 })} bonus` });
    if (prevBase != null && s.baseComp > prevBase) {
      events.push({ stubDate: s.date, label: 'Raise', tone: 'green', desc: `${fmtMoney(prevBase, { decimals: 0 })} → ${fmtMoney(s.baseComp, { decimals: 0 })}` });
    }
    const hasEspp = s.deductions.some((d) => d.label.toUpperCase().includes('ESPP'));
    if (hasEspp && !esppSeen) {
      events.push({ stubDate: s.date, label: 'ESPP', tone: 'blue', desc: 'Stock purchase started' });
      esppSeen = true;
    }
    // W-4 elections changed vs the prior stub.
    if (prevTax && s.taxSettings) {
      const t = s.taxSettings;
      const changes: string[] = [];
      if ((t.claimDependent ?? 0) !== (prevTax.claimDependent ?? 0))
        changes.push(`Dependents ${fmtMoney(prevTax.claimDependent ?? 0, { decimals: 0 })} → ${fmtMoney(t.claimDependent ?? 0, { decimals: 0 })}`);
      if ((t.allowances ?? 0) !== (prevTax.allowances ?? 0))
        changes.push(`Allowances ${prevTax.allowances ?? 0} → ${t.allowances ?? 0}`);
      if ((t.additionalAllowances ?? 0) !== (prevTax.additionalAllowances ?? 0))
        changes.push(`Add'l allowances ${prevTax.additionalAllowances ?? 0} → ${t.additionalAllowances ?? 0}`);
      if (t.filingStatus !== prevTax.filingStatus)
        changes.push(`Filing ${prevTax.filingStatus ?? '—'} → ${t.filingStatus ?? '—'}`);
      if (changes.length) events.push({ stubDate: s.date, label: 'W-4', tone: 'amber', desc: changes.join(' · ') });
    }
    if (s.baseComp > 0) prevBase = s.baseComp;
    if (s.taxSettings) prevTax = s.taxSettings;
  }
  return events;
}

export function stubYears(stubs: Stub[]): number[] {
  return [...new Set(stubs.map((s) => Number(s.date.slice(0, 4))))].sort((a, b) => a - b);
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
