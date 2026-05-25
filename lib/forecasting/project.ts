/**
 * Net-worth / retirement projection math. Pure (no DB) so the Forecasting page
 * can recompute interactively as the user drags the scenario inputs.
 *
 * Compounds net worth annually: `nw = nw·(1+return) + contribution`, with the
 * contribution optionally growing each year. Reports both nominal and
 * inflation-adjusted (real, today's dollars) trajectories, the FI number
 * (25× expenses — the 4% rule), and the year each milestone is reached.
 */

export type ProjectionParams = {
  startNetWorth: number;
  annualContribution: number;
  annualReturnPct: number; // nominal
  inflationPct: number;
  contributionGrowthPct: number; // annual raise applied to the contribution
  years: number;
  annualExpenses: number; // for the FI number (today's dollars)
};

export type ProjectionPoint = { year: number; nominal: number; real: number };
export type Milestone = { label: string; target: number; year: number | null };

export type Projection = {
  points: ProjectionPoint[];
  finalNominal: number;
  finalReal: number;
  totalContributed: number;
  fiNumber: number; // 25× annual expenses, in today's dollars
  fiYear: number | null; // first year real net worth ≥ fiNumber
  milestones: Milestone[];
};

const round = (n: number) => Math.round(n);

export function project(p: ProjectionParams): Projection {
  const r = p.annualReturnPct / 100;
  const infl = p.inflationPct / 100;
  const cg = p.contributionGrowthPct / 100;
  const years = Math.max(1, Math.min(60, Math.round(p.years)));

  const points: ProjectionPoint[] = [{ year: 0, nominal: round(p.startNetWorth), real: round(p.startNetWorth) }];
  let nw = p.startNetWorth;
  let contribution = p.annualContribution;
  let totalContributed = 0;
  for (let y = 1; y <= years; y++) {
    nw = nw * (1 + r) + contribution;
    totalContributed += contribution;
    contribution *= 1 + cg;
    points.push({ year: y, nominal: round(nw), real: round(nw / Math.pow(1 + infl, y)) });
  }

  const fiNumber = round(p.annualExpenses * 25);
  let fiYear: number | null = null;
  if (fiNumber > 0) for (const pt of points) if (pt.real >= fiNumber) { fiYear = pt.year; break; }

  const firstYearAtLeast = (target: number) => {
    for (const pt of points) if (pt.nominal >= target) return pt.year;
    return null;
  };
  const milestones: Milestone[] = [500_000, 1_000_000, 2_000_000, 5_000_000]
    .map((target) => ({ label: target >= 1_000_000 ? `$${target / 1_000_000}M` : `$${target / 1000}k`, target, year: firstYearAtLeast(target) }))
    .filter((m) => m.year != null && m.target > p.startNetWorth);

  const last = points[points.length - 1]!;
  return {
    points,
    finalNominal: last.nominal,
    finalReal: last.real,
    totalContributed: round(totalContributed),
    fiNumber,
    fiYear,
    milestones,
  };
}
