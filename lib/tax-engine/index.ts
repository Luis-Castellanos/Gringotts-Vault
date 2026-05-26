/**
 * Tax engine — public surface. PORTABLE: nothing here imports from the rest of
 * the app, so the whole `lib/tax-engine/` folder can be lifted into a standalone
 * package/app. See docs/tax-engine-roadmap.md.
 */

export * from './model';
export { LATEST_TAX_YEAR, SUPPORTED_YEARS, yearData } from './data';
export { computeFederalReturn } from './federal/return';
export { marginalRate, taxFromBrackets } from './federal/brackets';
export { netCapitalGains, qbiDeduction } from './federal/schedules';
export { taxFacts } from './facts';
export type { TaxFact, TaxFactGroup, TaxFactsYear } from './facts';
export { DOCUMENT_SCHEMAS, DOCUMENT_ORDER, aggregateDocuments } from './documents';
export type { TaxDocument, TaxDocumentType, DocSchema, DocFieldDef, DocOptionDef, DocumentAggregate } from './documents';
export { WORKSPACE_VERSION, defaultWorkspace, workspaceToInput, computeWorkspace, normalizeWorkspace } from './workspace';
export type { TaxWorkspace } from './workspace';
export { emptyLevers, leversActive, applyLevers, bracketSegments, bracketHeadroom, scenarioConsequences } from './scenario';
export type { ScenarioLevers, BracketSegment, Consequence } from './scenario';

import type { TaxReturnInput, TaxReturnResult } from './model';
import { computeFederalReturn } from './federal/return';

/** Top-level entry. (State modules will compose in here in phase T7.) */
export function computeReturn(input: TaxReturnInput): TaxReturnResult {
  return computeFederalReturn(input);
}

/** A zeroed input for the given year/status — convenient base to spread over. */
export function emptyInput(taxYear: number, filingStatus: TaxReturnInput['filingStatus'] = 'single'): TaxReturnInput {
  return {
    taxYear,
    filingStatus,
    dependentsUnder17: 0,
    otherDependents: 0,
    income: { wages: 0, taxableInterest: 0, ordinaryDividends: 0, qualifiedDividends: 0, iraPensionDistributions: 0, socialSecurityBenefits: 0, unemployment: 0, otherOrdinaryIncome: 0 },
    scheduleC: [],
    scheduleD: { netShortTerm: 0, netLongTerm: 0 },
    scheduleE: { rentalNet: 0, royalties: 0, passthroughOrdinary: 0 },
    adjustments: { hsa: 0, iraDeduction: 0, studentLoanInterest: 0, educatorExpenses: 0, seHealthInsurance: 0, seRetirement: 0, other: 0 },
    itemized: null,
    credits: { dependentCareExpenses: 0, dependentCareQualifyingPersons: 0, aotcStudents: 0, aotcExpenses: 0, llcExpenses: 0, energyCredits: 0, otherCredits: 0 },
    withholding: 0,
    estimatedPayments: 0,
    priorYearTax: 0,
    priorYearAgiOver150k: false,
  };
}
