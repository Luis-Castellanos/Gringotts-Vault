import type { FilingStatus, YearData } from '../model';

/** Child Tax Credit + Credit for Other Dependents, with the MAGI phaseout. */
export function childTaxCredit(
  childrenUnder17: number,
  otherDependents: number,
  magi: number,
  status: FilingStatus,
  data: YearData,
): number {
  const base = childrenUnder17 * data.ctc.perChild + otherDependents * data.ctc.perOtherDependent;
  if (base <= 0) return 0;
  const over = Math.max(0, magi - data.ctc.phaseoutStart[status]);
  const reduction = Math.ceil(over / 1000) * data.ctc.phaseoutPer1000;
  return Math.max(0, base - reduction);
}
