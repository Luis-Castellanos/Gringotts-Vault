/**
 * Depreciation (Real Estate Phase 6). Straight-line: the building depreciates
 * over 27.5 years (US residential) on its basis (purchase price − land), and
 * each capital improvement depreciates over its own useful life. The annual
 * total for a tax year feeds Schedule E line 18. Pure functions.
 *
 * Simplification: full-year amounts for any year in service (no mid-month
 * convention / first-year proration) — fine for a planning estimate.
 */

export const RESIDENTIAL_LIFE = 27.5;
const DEFAULT_LAND_PCT = 20;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CapexLite = { description: string; cost: number; placedInService: string | null; usefulLifeYears: number };
export type DepLine = { label: string; basis: number; lifeYears: number; annual: number };
export type Depreciation = {
  landValuePct: number;
  buildingBasis: number;
  buildingAnnual: number;
  lines: DepLine[]; // building + capex items in service for `year`
  annualTotal: number;
};

export function computeDepreciation(
  property: { acquisitionPrice: number | null; acquisitionDate: string | null; landValuePct: number | null },
  capexItems: CapexLite[],
  year: number,
): Depreciation {
  const landValuePct = property.landValuePct ?? DEFAULT_LAND_PCT;
  const buildingBasis = property.acquisitionPrice != null ? round2(property.acquisitionPrice * (1 - landValuePct / 100)) : 0;
  const buildingAnnual = buildingBasis > 0 ? round2(buildingBasis / RESIDENTIAL_LIFE) : 0;

  const lines: DepLine[] = [];
  let annualTotal = 0;

  if (buildingAnnual > 0 && property.acquisitionDate) {
    const placedYear = Number(property.acquisitionDate.slice(0, 4));
    if (year >= placedYear && year < placedYear + Math.ceil(RESIDENTIAL_LIFE)) {
      lines.push({ label: 'Building (27.5-yr straight-line)', basis: buildingBasis, lifeYears: RESIDENTIAL_LIFE, annual: buildingAnnual });
      annualTotal += buildingAnnual;
    }
  }

  for (const c of capexItems) {
    const life = c.usefulLifeYears || 5;
    const annual = round2(c.cost / life);
    if (annual <= 0) continue;
    const placedYear = c.placedInService ? Number(c.placedInService.slice(0, 4)) : null;
    const inService = placedYear == null || (year >= placedYear && year < placedYear + life);
    if (inService) {
      lines.push({ label: c.description, basis: c.cost, lifeYears: life, annual });
      annualTotal += annual;
    }
  }

  return { landValuePct, buildingBasis, buildingAnnual, lines, annualTotal: round2(annualTotal) };
}
