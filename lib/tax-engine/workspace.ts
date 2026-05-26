/**
 * TaxWorkspace — the full, persistable state of a hand-built return: profile +
 * documents + the manually-entered deduction/credit/payment sections. PORTABLE:
 * no app imports. `workspaceToInput` is the bridge from this editable shape to
 * the engine's TaxReturnInput (documents flow through aggregateDocuments; the
 * manual sections fill the rest), so the engine itself stays storage-agnostic.
 */

import type { FilingStatus, TaxReturnInput, TaxReturnResult } from './model';
import { computeFederalReturn } from './federal/return';
import { aggregateDocuments, type TaxDocument } from './documents';
import type { SavedScenario } from './scenario';

export const WORKSPACE_VERSION = 1;

export type TaxWorkspace = {
  version: number;
  taxYear: number;
  filingStatus: FilingStatus;
  profile: {
    taxpayerName: string;
    spouseName: string;
    state: string; // informational (no state calc yet)
    dependentsUnder17: number;
    otherDependents: number;
  };
  documents: TaxDocument[];
  // Itemized inputs entered by hand. Mortgage interest is NOT here — it flows
  // from any 1098 documents (single source of truth).
  itemized: {
    medicalExpenses: number;
    stateLocalTaxes: number;
    investmentInterest: number;
    charitableCash: number;
    charitableNonCash: number;
    casualtyTheft: number;
    otherItemized: number;
  };
  // Above-the-line adjustments. Student-loan interest is NOT here — it flows from 1098-E.
  adjustments: {
    hsa: number;
    iraDeduction: number;
    educatorExpenses: number;
    seHealthInsurance: number;
    seRetirement: number;
    other: number;
  };
  // Credits entered by hand. Education credits are NOT here — they flow from 1098-T.
  credits: {
    dependentCareExpenses: number;
    dependentCareQualifyingPersons: number;
    energyCredits: number;
    otherCredits: number;
  };
  payments: {
    estimatedPayments: number;
    priorYearTax: number;
    priorYearAgiOver150k: boolean;
  };
  notes: string; // free-text work-paper notes
  scenarios: SavedScenario[]; // saved what-if scenarios (Plan tab)
};

export function defaultWorkspace(taxYear: number, filingStatus: FilingStatus = 'single'): TaxWorkspace {
  return {
    version: WORKSPACE_VERSION,
    taxYear,
    filingStatus,
    profile: { taxpayerName: '', spouseName: '', state: '', dependentsUnder17: 0, otherDependents: 0 },
    documents: [],
    itemized: { medicalExpenses: 0, stateLocalTaxes: 0, investmentInterest: 0, charitableCash: 0, charitableNonCash: 0, casualtyTheft: 0, otherItemized: 0 },
    adjustments: { hsa: 0, iraDeduction: 0, educatorExpenses: 0, seHealthInsurance: 0, seRetirement: 0, other: 0 },
    credits: { dependentCareExpenses: 0, dependentCareQualifyingPersons: 0, energyCredits: 0, otherCredits: 0 },
    payments: { estimatedPayments: 0, priorYearTax: 0, priorYearAgiOver150k: false },
    notes: '',
    scenarios: [],
  };
}

/** Bridge: editable workspace → engine input. Documents flow through; manual sections fill the rest. */
export function workspaceToInput(ws: TaxWorkspace): TaxReturnInput {
  const agg = aggregateDocuments(ws.documents);

  const itemizedRaw = {
    medicalExpenses: ws.itemized.medicalExpenses,
    stateLocalTaxes: ws.itemized.stateLocalTaxes,
    mortgageInterest: agg.mortgageInterest,
    investmentInterest: ws.itemized.investmentInterest,
    charitableCash: ws.itemized.charitableCash,
    charitableNonCash: ws.itemized.charitableNonCash,
    casualtyTheft: ws.itemized.casualtyTheft,
    otherItemized: ws.itemized.otherItemized,
  };
  const hasItemized = Object.values(itemizedRaw).some((v) => v > 0);

  return {
    taxYear: ws.taxYear,
    filingStatus: ws.filingStatus,
    dependentsUnder17: ws.profile.dependentsUnder17,
    otherDependents: ws.profile.otherDependents,
    income: {
      wages: agg.wages,
      taxableInterest: agg.taxableInterest,
      ordinaryDividends: agg.ordinaryDividends,
      qualifiedDividends: agg.qualifiedDividends,
      iraPensionDistributions: agg.iraPension,
      socialSecurityBenefits: agg.ssBenefits,
      unemployment: agg.unemployment,
      otherOrdinaryIncome: agg.otherOrdinary,
    },
    scheduleC: agg.scheduleC,
    scheduleD: agg.scheduleD,
    scheduleE: agg.scheduleE,
    adjustments: {
      hsa: ws.adjustments.hsa,
      iraDeduction: ws.adjustments.iraDeduction,
      studentLoanInterest: Math.min(2_500, agg.studentLoanInterest),
      educatorExpenses: ws.adjustments.educatorExpenses,
      seHealthInsurance: ws.adjustments.seHealthInsurance,
      seRetirement: ws.adjustments.seRetirement,
      other: ws.adjustments.other,
    },
    itemized: hasItemized ? itemizedRaw : null,
    credits: {
      dependentCareExpenses: ws.credits.dependentCareExpenses,
      dependentCareQualifyingPersons: ws.credits.dependentCareQualifyingPersons,
      aotcStudents: agg.aotcStudents,
      aotcExpenses: agg.aotcExpenses,
      llcExpenses: agg.llcExpenses,
      energyCredits: ws.credits.energyCredits,
      otherCredits: ws.credits.otherCredits,
    },
    withholding: agg.fedWithholding,
    estimatedPayments: ws.payments.estimatedPayments,
    priorYearTax: ws.payments.priorYearTax,
    priorYearAgiOver150k: ws.payments.priorYearAgiOver150k,
  };
}

/** Convenience: workspace → computed federal result. */
export function computeWorkspace(ws: TaxWorkspace): TaxReturnResult {
  return computeFederalReturn(workspaceToInput(ws));
}

/** Migrate a stored workspace forward (and merge in any new default fields). */
export function normalizeWorkspace(raw: unknown, taxYear: number, filingStatus: FilingStatus = 'single'): TaxWorkspace {
  const base = defaultWorkspace(taxYear, filingStatus);
  if (!raw || typeof raw !== 'object') return base;
  const w = raw as Partial<TaxWorkspace>;
  return {
    ...base,
    ...w,
    profile: { ...base.profile, ...(w.profile ?? {}) },
    itemized: { ...base.itemized, ...(w.itemized ?? {}) },
    adjustments: { ...base.adjustments, ...(w.adjustments ?? {}) },
    credits: { ...base.credits, ...(w.credits ?? {}) },
    payments: { ...base.payments, ...(w.payments ?? {}) },
    documents: Array.isArray(w.documents) ? w.documents : [],
    scenarios: Array.isArray(w.scenarios) ? w.scenarios : [],
    version: WORKSPACE_VERSION,
  };
}
