/**
 * Tax documents — the source forms a filer transcribes (W-2, the 1099 family,
 * 1098s, K-1, plus the Schedule C/E worksheets). PORTABLE: pure types + an
 * aggregation formula, no app imports. Each document is typed and carries its
 * box values; `aggregateDocuments` is the single place those boxes "flow
 * through" into the engine's TaxReturnInput.
 *
 * Design rule — every figure has exactly one home, so nothing is double-counted:
 * income / withholding / capital gains / SE / rental / pass-through come from
 * documents here; mortgage interest from 1098, student-loan interest from
 * 1098-E, education expenses from 1098-T; all other deductions/credits are
 * entered manually in the workspace's deduction sections.
 */

import type { ScheduleCInput, ScheduleDInput, ScheduleEInput } from './model';

export type TaxDocumentType =
  | 'w2'
  | '1099-int'
  | '1099-div'
  | '1099-b'
  | '1099-r'
  | '1099-g'
  | 'ssa-1099'
  | '1099-nec'
  | '1099-misc'
  | 'k-1'
  | 'schedule-c'
  | 'schedule-e'
  | '1098'
  | '1098-e'
  | '1098-t';

export type TaxDocument = {
  id: string;
  type: TaxDocumentType;
  label?: string; // employer / payer / entity name
  fields: Record<string, number>;
  options?: Record<string, string | boolean>;
};

export type DocFieldDef = { key: string; label: string; note?: string };
export type DocOptionDef = { key: string; label: string; kind: 'toggle' | 'select'; choices?: { value: string; label: string }[]; default?: string | boolean };
export type DocSchema = {
  type: TaxDocumentType;
  title: string;
  short: string; // chip label
  icon: string; // emoji
  group: 'income' | 'investment' | 'business' | 'deduction';
  blurb: string;
  fields: DocFieldDef[];
  options?: DocOptionDef[];
  /** Optional live "net" summary for worksheet-style docs (Schedule C/E). */
  net?: (f: Record<string, number>) => { label: string; amount: number };
};

export const DOCUMENT_SCHEMAS: Record<TaxDocumentType, DocSchema> = {
  w2: {
    type: 'w2', title: 'W-2 — Wage & Tax Statement', short: 'W-2', icon: '🧾', group: 'income',
    blurb: 'Employer wages and the federal tax withheld from your paychecks.',
    fields: [
      { key: 'wages', label: 'Box 1 — Wages, tips, other comp' },
      { key: 'fedWithholding', label: 'Box 2 — Federal income tax withheld' },
      { key: 'stateWithholding', label: 'Box 17 — State income tax', note: 'informational' },
    ],
  },
  '1099-int': {
    type: '1099-int', title: '1099-INT — Interest Income', short: '1099-INT', icon: '🏦', group: 'income',
    blurb: 'Interest from banks, brokerages, and Treasury.',
    fields: [
      { key: 'interest', label: 'Box 1 — Interest income' },
      { key: 'fedWithholding', label: 'Box 4 — Federal tax withheld' },
    ],
  },
  '1099-div': {
    type: '1099-div', title: '1099-DIV — Dividends', short: '1099-DIV', icon: '📈', group: 'investment',
    blurb: 'Ordinary + qualified dividends and capital-gain distributions.',
    fields: [
      { key: 'ordinaryDividends', label: 'Box 1a — Total ordinary dividends' },
      { key: 'qualifiedDividends', label: 'Box 1b — Qualified dividends', note: 'subset of 1a' },
      { key: 'capitalGainDistributions', label: 'Box 2a — Capital-gain distributions', note: 'long-term' },
      { key: 'fedWithholding', label: 'Box 4 — Federal tax withheld' },
    ],
  },
  '1099-b': {
    type: '1099-b', title: '1099-B — Proceeds (Capital Gains)', short: '1099-B', icon: '💹', group: 'investment',
    blurb: 'Net realized gains/losses from selling securities. Enter the netted short- and long-term totals.',
    fields: [
      { key: 'shortTermGain', label: 'Net short-term gain / (loss)' },
      { key: 'longTermGain', label: 'Net long-term gain / (loss)' },
      { key: 'fedWithholding', label: 'Federal tax withheld' },
    ],
  },
  '1099-r': {
    type: '1099-r', title: '1099-R — Retirement Distributions', short: '1099-R', icon: '🏛️', group: 'income',
    blurb: 'Taxable IRA / pension / annuity distributions.',
    fields: [
      { key: 'taxableAmount', label: 'Box 2a — Taxable amount' },
      { key: 'fedWithholding', label: 'Box 4 — Federal tax withheld' },
    ],
  },
  '1099-g': {
    type: '1099-g', title: '1099-G — Government Payments', short: '1099-G', icon: '🏢', group: 'income',
    blurb: 'Unemployment compensation and certain government payments.',
    fields: [
      { key: 'unemployment', label: 'Box 1 — Unemployment compensation' },
      { key: 'fedWithholding', label: 'Box 4 — Federal tax withheld' },
    ],
  },
  'ssa-1099': {
    type: 'ssa-1099', title: 'SSA-1099 — Social Security', short: 'SSA-1099', icon: '👵', group: 'income',
    blurb: 'Social Security benefits. The taxable portion is computed (0–85%).',
    fields: [{ key: 'netBenefits', label: 'Box 5 — Net benefits' }],
  },
  '1099-nec': {
    type: '1099-nec', title: '1099-NEC — Nonemployee Comp', short: '1099-NEC', icon: '🔧', group: 'business',
    blurb: 'Self-employment income. Flows to Schedule C (subject to SE tax + QBI). Add a Schedule C instead if you have expenses to deduct.',
    fields: [{ key: 'nonemployeeComp', label: 'Box 1 — Nonemployee compensation' }],
    options: [{ key: 'isSSTB', label: 'Specified service business (SSTB)', kind: 'toggle', default: false }],
  },
  '1099-misc': {
    type: '1099-misc', title: '1099-MISC — Miscellaneous', short: '1099-MISC', icon: '📦', group: 'income',
    blurb: 'Rents, royalties, and other income.',
    fields: [
      { key: 'rents', label: 'Box 1 — Rents', note: '→ Schedule E' },
      { key: 'royalties', label: 'Box 2 — Royalties' },
      { key: 'otherIncome', label: 'Box 3 — Other income' },
      { key: 'fedWithholding', label: 'Box 4 — Federal tax withheld' },
    ],
  },
  'k-1': {
    type: 'k-1', title: 'Schedule K-1 — Pass-through', short: 'K-1', icon: '🤝', group: 'business',
    blurb: 'Your share from a partnership / S-corp. Box 1 is QBI-eligible ordinary income.',
    fields: [
      { key: 'ordinaryBusinessIncome', label: 'Box 1 — Ordinary business income' },
      { key: 'netRentalRealEstate', label: 'Box 2 — Net rental real estate' },
      { key: 'interestIncome', label: 'Box 5 — Interest income' },
      { key: 'ordinaryDividends', label: 'Box 6a — Ordinary dividends' },
      { key: 'qualifiedDividends', label: 'Box 6b — Qualified dividends' },
      { key: 'netLongTermGain', label: 'Box 9a — Net long-term capital gain' },
    ],
    options: [{ key: 'isSSTB', label: 'Specified service business (SSTB)', kind: 'toggle', default: false }],
  },
  'schedule-c': {
    type: 'schedule-c', title: 'Schedule C — Business', short: 'Sch C', icon: '🏪', group: 'business',
    blurb: 'A sole-proprietor business. Net profit is subject to SE tax and counts toward QBI.',
    fields: [
      { key: 'grossReceipts', label: 'Gross receipts' },
      { key: 'totalExpenses', label: 'Total expenses' },
    ],
    options: [{ key: 'isSSTB', label: 'Specified service business (SSTB)', kind: 'toggle', default: false }],
    net: (f) => ({ label: 'Net profit', amount: (f.grossReceipts ?? 0) - (f.totalExpenses ?? 0) }),
  },
  'schedule-e': {
    type: 'schedule-e', title: 'Schedule E — Rental / Royalty', short: 'Sch E', icon: '🏠', group: 'business',
    blurb: 'Rental real estate. Net = rents − expenses − depreciation (passive-loss limits not modeled).',
    fields: [
      { key: 'rents', label: 'Rents received' },
      { key: 'expenses', label: 'Operating expenses' },
      { key: 'depreciation', label: 'Depreciation' },
    ],
    net: (f) => ({ label: 'Net rental', amount: (f.rents ?? 0) - (f.expenses ?? 0) - (f.depreciation ?? 0) }),
  },
  '1098': {
    type: '1098', title: '1098 — Mortgage Interest', short: '1098', icon: '🏡', group: 'deduction',
    blurb: 'Home mortgage interest (+ points). Flows to itemized deductions (Schedule A).',
    fields: [
      { key: 'mortgageInterest', label: 'Box 1 — Mortgage interest' },
      { key: 'points', label: 'Box 6 — Points paid' },
    ],
  },
  '1098-e': {
    type: '1098-e', title: '1098-E — Student Loan Interest', short: '1098-E', icon: '🎓', group: 'deduction',
    blurb: 'Student-loan interest (above-the-line adjustment, capped at $2,500).',
    fields: [{ key: 'studentLoanInterest', label: 'Box 1 — Student loan interest' }],
  },
  '1098-t': {
    type: '1098-t', title: '1098-T — Tuition', short: '1098-T', icon: '🏫', group: 'deduction',
    blurb: 'Qualified tuition. Choose which education credit to apply.',
    fields: [{ key: 'qualifiedTuition', label: 'Box 1 — Payments received' }],
    options: [
      { key: 'creditType', label: 'Education credit', kind: 'select', default: 'aotc', choices: [
        { value: 'aotc', label: 'American Opportunity (AOTC)' },
        { value: 'llc', label: 'Lifetime Learning (LLC)' },
        { value: 'none', label: 'None' },
      ] },
    ],
  },
};

export const DOCUMENT_ORDER: TaxDocumentType[] = [
  'w2', '1099-int', '1099-div', '1099-b', '1099-r', '1099-g', 'ssa-1099', '1099-nec', '1099-misc', 'k-1', 'schedule-c', 'schedule-e', '1098', '1098-e', '1098-t',
];

const n = (v: number | undefined) => v ?? 0;

export type DocumentAggregate = {
  wages: number;
  fedWithholding: number;
  taxableInterest: number;
  ordinaryDividends: number;
  qualifiedDividends: number;
  iraPension: number;
  unemployment: number;
  ssBenefits: number;
  otherOrdinary: number;
  scheduleC: ScheduleCInput[];
  scheduleD: ScheduleDInput;
  scheduleE: ScheduleEInput;
  mortgageInterest: number;
  studentLoanInterest: number;
  aotcStudents: number;
  aotcExpenses: number;
  llcExpenses: number;
};

/** The flow-through formula: collapse a list of documents into engine income/payment figures. */
export function aggregateDocuments(docs: TaxDocument[]): DocumentAggregate {
  const agg: DocumentAggregate = {
    wages: 0, fedWithholding: 0, taxableInterest: 0, ordinaryDividends: 0, qualifiedDividends: 0,
    iraPension: 0, unemployment: 0, ssBenefits: 0, otherOrdinary: 0,
    scheduleC: [], scheduleD: { netShortTerm: 0, netLongTerm: 0 },
    scheduleE: { rentalNet: 0, royalties: 0, passthroughOrdinary: 0 },
    mortgageInterest: 0, studentLoanInterest: 0, aotcStudents: 0, aotcExpenses: 0, llcExpenses: 0,
  };

  for (const d of docs) {
    const f = d.fields;
    switch (d.type) {
      case 'w2':
        agg.wages += n(f.wages); agg.fedWithholding += n(f.fedWithholding); break;
      case '1099-int':
        agg.taxableInterest += n(f.interest); agg.fedWithholding += n(f.fedWithholding); break;
      case '1099-div':
        agg.ordinaryDividends += n(f.ordinaryDividends); agg.qualifiedDividends += n(f.qualifiedDividends);
        agg.scheduleD.netLongTerm += n(f.capitalGainDistributions); agg.fedWithholding += n(f.fedWithholding); break;
      case '1099-b':
        agg.scheduleD.netShortTerm += n(f.shortTermGain); agg.scheduleD.netLongTerm += n(f.longTermGain); agg.fedWithholding += n(f.fedWithholding); break;
      case '1099-r':
        agg.iraPension += n(f.taxableAmount); agg.fedWithholding += n(f.fedWithholding); break;
      case '1099-g':
        agg.unemployment += n(f.unemployment); agg.fedWithholding += n(f.fedWithholding); break;
      case 'ssa-1099':
        agg.ssBenefits += n(f.netBenefits); break;
      case '1099-nec':
        agg.scheduleC.push({ name: d.label, netProfit: n(f.nonemployeeComp), isSSTB: d.options?.isSSTB === true }); break;
      case '1099-misc':
        agg.scheduleE.rentalNet += n(f.rents); agg.scheduleE.royalties += n(f.royalties);
        agg.otherOrdinary += n(f.otherIncome); agg.fedWithholding += n(f.fedWithholding); break;
      case 'k-1':
        agg.scheduleE.passthroughOrdinary += n(f.ordinaryBusinessIncome); agg.scheduleE.rentalNet += n(f.netRentalRealEstate);
        agg.taxableInterest += n(f.interestIncome); agg.ordinaryDividends += n(f.ordinaryDividends);
        agg.qualifiedDividends += n(f.qualifiedDividends); agg.scheduleD.netLongTerm += n(f.netLongTermGain);
        if (d.options?.isSSTB === true) agg.scheduleE.passthroughIsSSTB = true; break;
      case 'schedule-c':
        agg.scheduleC.push({ name: d.label, netProfit: n(f.grossReceipts) - n(f.totalExpenses), isSSTB: d.options?.isSSTB === true }); break;
      case 'schedule-e':
        agg.scheduleE.rentalNet += n(f.rents) - n(f.expenses) - n(f.depreciation); break;
      case '1098':
        agg.mortgageInterest += n(f.mortgageInterest) + n(f.points); break;
      case '1098-e':
        agg.studentLoanInterest += n(f.studentLoanInterest); break;
      case '1098-t': {
        const choice = (d.options?.creditType as string) ?? 'aotc';
        if (choice === 'aotc') { agg.aotcStudents += 1; agg.aotcExpenses += n(f.qualifiedTuition); }
        else if (choice === 'llc') { agg.llcExpenses += n(f.qualifiedTuition); }
        break;
      }
    }
  }
  return agg;
}
