/**
 * Year-end tax summary — falls out of the data Vault already has: W-2 wages +
 * withholding from paystubs, investment income + itemizable deductions from
 * categorized transactions, and a federal liability estimate (lib/tax/brackets).
 * Estimates only — a planning aid, not a filed return. (For an actual return,
 * Aiwyn's engine is usable interactively via the Claude MCP, but it has no
 * runtime API the app can call.)
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, paystubs, transactions } from '@/lib/db/schema';
import type { PaystubLine, PaystubTaxSettings } from '@/lib/db/schema';
import {
  federalTax,
  marginalRate,
  standardDeduction,
  normalizeFilingStatus,
  bracketsYear,
  LATEST_TAX_YEAR,
  type FilingStatus,
} from './brackets';

const round2 = (n: number) => Math.round(n * 100) / 100;

const FED_RE = /federal/i;
const FICA_RE = /social security|medicare|oasdi|\bfica\b/i;
const STATE_INCOME_RE = /state/i;
const STATE_EXCLUDE_RE = /disab|\bsdi\b|\bsui\b|unempl|\bvpdi\b|paid family/i;
const PRETAX_RE = /401|403\(?b\)?|457|\bhsa\b|\bfsa\b|medical|dental|vision|health|insurance|pre.?tax/i;

export type TaxIncomeLine = { label: string; amount: number };
export type TaxSummary = {
  year: number;
  rulesYear: number; // the bracket-table year actually used
  filingStatus: FilingStatus;
  filingStatusSource: 'w4' | 'default';
  stubCount: number;
  // Income
  grossWages: number;
  preTaxDeductions: number;
  taxableWages: number; // ≈ W-2 Box 1 (gross − pre-tax)
  investmentIncome: number;
  otherIncome: TaxIncomeLine[]; // interest / dividends / etc. from transactions
  totalIncome: number;
  // Withholding
  federalWithheld: number;
  stateWithheld: number;
  ficaWithheld: number;
  // Deductions
  standardDeduction: number;
  itemized: { label: string; amount: number }[];
  itemizedTotal: number;
  deductionUsed: number;
  itemizes: boolean;
  // Federal estimate
  taxableIncome: number;
  estFederalTax: number;
  estRefundOrOwe: number; // + = refund, − = owe
  effectiveRate: number | null; // est federal tax / total income
  marginalRate: number;
  hasData: boolean;
};

/** Distinct tax years present in paystubs (desc). */
export async function loadTaxYears(): Promise<number[]> {
  const rows = await db
    .select({ y: sql<string>`DISTINCT EXTRACT(YEAR FROM ${paystubs.payDate})::int::text` })
    .from(paystubs)
    .where(sql`${paystubs.payDate} IS NOT NULL`);
  const years = rows.map((r) => Number(r.y)).filter((y) => y > 0).sort((a, b) => b - a);
  return years.length ? years : [LATEST_TAX_YEAR];
}

function classifyWithholding(taxes: PaystubLine[]) {
  let federal = 0;
  let state = 0;
  let fica = 0;
  for (const t of taxes) {
    const l = t.label;
    if (FED_RE.test(l)) federal += t.amount;
    else if (FICA_RE.test(l)) fica += t.amount;
    else if (STATE_INCOME_RE.test(l) && !STATE_EXCLUDE_RE.test(l)) state += t.amount;
  }
  return { federal, state, fica };
}

export async function loadTaxSummary(year: number): Promise<TaxSummary> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [stubs, txnCats] = await Promise.all([
    db.select().from(paystubs).where(and(gte(paystubs.payDate, start), lte(paystubs.payDate, end))),
    // Year's categorized flows by category name (for investment income + itemizable deductions).
    db
      .select({
        name: sql<string>`COALESCE(${categories.name}, 'Uncategorized')`,
        flow: sql<string>`COALESCE(${categories.flowType}, 'outflow')`,
        total: sql<string>`SUM(${transactions.amount})::text`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(gte(transactions.date, start), lte(transactions.date, end), eq(transactions.isTransfer, false)))
      .groupBy(sql`COALESCE(${categories.name}, 'Uncategorized')`, sql`COALESCE(${categories.flowType}, 'outflow')`),
  ]);

  let grossWages = 0;
  let preTaxDeductions = 0;
  let federalWithheld = 0;
  let stateWithheld = 0;
  let ficaWithheld = 0;
  let filing: PaystubTaxSettings['filingStatus'] | null = null;
  for (const s of stubs) {
    grossWages += Number(s.gross ?? 0);
    for (const d of (s.deductions ?? []) as PaystubLine[]) if (PRETAX_RE.test(d.label)) preTaxDeductions += d.amount;
    const w = classifyWithholding((s.taxes ?? []) as PaystubLine[]);
    federalWithheld += w.federal;
    stateWithheld += w.state;
    ficaWithheld += w.fica;
    if (!filing && s.taxSettings?.filingStatus) filing = s.taxSettings.filingStatus;
  }
  const taxableWages = Math.max(0, grossWages - preTaxDeductions);

  // Investment / other ordinary income + itemizable deductions from categories.
  const otherIncome: TaxIncomeLine[] = [];
  let investmentIncome = 0;
  const itemized: { label: string; amount: number }[] = [];
  let mortgageInterest = 0;
  let charitable = 0;
  let propertyTax = 0;
  for (const c of txnCats) {
    const amt = Number(c.total);
    if (c.flow === 'inflow' && /interest|dividend|capital gain/i.test(c.name)) {
      investmentIncome += amt;
      otherIncome.push({ label: c.name, amount: round2(amt) });
    } else if (c.flow === 'outflow') {
      const out = Math.abs(amt);
      if (/mortgage interest|interest.*mortgage/i.test(c.name)) mortgageInterest += out;
      else if (/charit|donation|tithe/i.test(c.name)) charitable += out;
      else if (/property tax|real estate tax/i.test(c.name)) propertyTax += out;
    }
  }
  investmentIncome = round2(investmentIncome);

  const filingStatus = normalizeFilingStatus(filing);
  const filingStatusSource: 'w4' | 'default' = filing ? 'w4' : 'default';

  // Itemized estimate: SALT (state income tax + property tax, capped $10k) +
  // mortgage interest + charitable.
  const salt = Math.min(10_000, stateWithheld + propertyTax);
  if (salt > 0) itemized.push({ label: 'State & local taxes (SALT, capped $10k)', amount: round2(salt) });
  if (mortgageInterest > 0) itemized.push({ label: 'Mortgage interest', amount: round2(mortgageInterest) });
  if (charitable > 0) itemized.push({ label: 'Charitable contributions', amount: round2(charitable) });
  const itemizedTotal = round2(itemized.reduce((s, i) => s + i.amount, 0));

  const std = standardDeduction(year, filingStatus);
  const itemizes = itemizedTotal > std;
  const deductionUsed = itemizes ? itemizedTotal : std;

  const totalIncome = round2(taxableWages + investmentIncome);
  const taxableIncome = Math.max(0, round2(totalIncome - deductionUsed));
  const estFederalTax = federalTax(taxableIncome, year, filingStatus);
  const estRefundOrOwe = round2(federalWithheld - estFederalTax);

  return {
    year,
    rulesYear: bracketsYear(year),
    filingStatus,
    filingStatusSource,
    stubCount: stubs.length,
    grossWages: round2(grossWages),
    preTaxDeductions: round2(preTaxDeductions),
    taxableWages: round2(taxableWages),
    investmentIncome,
    otherIncome: otherIncome.sort((a, b) => b.amount - a.amount),
    totalIncome,
    federalWithheld: round2(federalWithheld),
    stateWithheld: round2(stateWithheld),
    ficaWithheld: round2(ficaWithheld),
    standardDeduction: std,
    itemized,
    itemizedTotal,
    deductionUsed,
    itemizes,
    taxableIncome,
    estFederalTax,
    estRefundOrOwe,
    effectiveRate: totalIncome > 0 ? round2((estFederalTax / totalIncome) * 100) : null,
    marginalRate: marginalRate(taxableIncome, year, filingStatus) * 100,
    hasData: stubs.length > 0 || totalIncome > 0,
  };
}
