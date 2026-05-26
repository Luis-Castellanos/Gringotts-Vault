# Tax Engine — sub-roadmap

A modular federal (then state) income-tax **calculation engine** that turns
financial data into an accurate year-end tax picture and, eventually, a
fileable-quality 1040. Built inside Vault for now, but **designed from day one to
be extracted into its own app/package** — so the engine is kept strictly
portable.

> Not tax advice. Estimates for planning; a real return should be reviewed by a
> preparer (or driven through the Aiwyn MCP interactively — see below).

## Design principles (non-negotiable, because this will branch off)

1. **The engine is pure.** Everything under `lib/tax-engine/` is plain
   TypeScript — **no imports from the rest of Vault**, no Next, no DB, no React.
   Inputs in → computed result out. This is the package boundary; to extract it,
   copy the folder.
2. **Data-driven by tax year.** All figures (brackets, standard deduction, FICA
   wage base, credit amounts/phaseouts, LTCG thresholds) live in per-year data
   tables (`data/<year>.ts`). Adding a new year = adding a data file, never
   touching the calc.
3. **Vault is just one adapter.** Mapping Vault data (paystubs, 1099s, brokerage
   realized gains, Schedule-E rental, transactions) → the engine's input model
   lives in `lib/tax/adapters/` **outside** the engine. A future standalone app
   writes its own adapter.
4. **Explainable.** Every computed line carries enough breakdown to render a
   1040-style worksheet and show the user *why*.

## Relationship to Aiwyn

Aiwyn's tax engine is **MCP-only** (Claude-interactive), not callable from app
runtime (see memory `aiwyn-tax`). So: this engine is the durable in-app
calculation/planning path; for an *actual filed return*, drive the Aiwyn MCP
interactively. The two are complementary — this engine produces the inputs Aiwyn
needs and a planning sandbox Aiwyn doesn't offer.

## Architecture

```
lib/tax-engine/                 ← PORTABLE. No external imports.
  model.ts                      input/output types (TaxReturnInput, TaxReturnResult)
  data/
    2024.ts  2025.ts            per-year federal tables (brackets, std ded, FICA, CTC, LTCG)
    index.ts                    year → table lookup
  federal/
    brackets.ts                 ordinary-rate tax from taxable income
    capital-gains.ts            LTCG/qualified-div stacking (0/15/20)
    fica.ts                     SE tax, additional Medicare, NIIT
    credits.ts                  CTC + (later) CDCC, education, saver's, EITC
    return.ts                   computeFederalReturn(input) → result
  state/                        pluggable per-state modules (later)
  index.ts                      public surface: computeReturn(input)
lib/tax/adapters/               ← Vault-specific. Maps DB → engine input. NOT portable.
```

## Phases

- **T0 — Foundation** ✓ *done.* Package boundary, `model.ts`, 2024+2025
  federal data tables, year lookup. No app coupling.
- **T1 — Core federal 1040** ✓ *done.* Total income → adjustments → AGI →
  standard-vs-itemized → taxable income → **ordinary-bracket tax + LTCG/QD
  stacking** → SE tax + additional Medicare + NIIT → liability →
  withholding/payments → refund/owed, with effective + marginal rate. Smoke-
  validated against known scenarios.
- **T2 — Credits & adjustments.** Child Tax Credit + ODC (phaseouts) ✓ done;
  above-the-line HSA / IRA / student-loan / ½-SE-tax ✓ done. *Remaining:*
  child/dep care, education (AOTC/LLC), saver's, EITC; SE health. (AMT flagged,
  likely deferred.)
- **T3 — Schedules.** C (self-employment → SE tax + ordinary + QBI), D (ST/LT
  netting, $3k loss limit, preferential LT), E (rental + royalties + K-1
  pass-through ordinary), and the **QBI / §199A** deduction (20% with the
  taxable-income cap and SSTB income-threshold phase-out; W-2/UBIA wage limit
  noted but not modeled) ✓ done & smoke-validated. *Remaining:* Schedule A
  (itemized w/ SALT cap) and B detail.
- **Key figures page** ✓ *done.* `lib/tax-engine/facts.ts` exposes the year's
  reference numbers (standard deduction, brackets, LTCG breakpoints, retirement
  / HSA / FSA limits, SS & Medicare, NIIT, CTC, QBI, mileage, estate/gift, AMT,
  FEIE, SALT cap), each tied to an IRS/SSA source; surfaced at `/tax/figures`.
- **T4 — Ingestion / reconciliation.** Map parsed **tax docs** (W-2 boxes, the
  1099 family, 1098/-T/-E — see ROADMAP tax-doc parsing goal) + Vault data into
  the input model; a reconciliation UI to confirm/override each line.
- **T5 — Withholding & estimates.** YTD withholding vs projected liability;
  quarterly estimated-payment calc + safe-harbor; paycheck what-if.
- **T6 — Planning sandbox.** Marginal-rate curve, Roth-conversion headroom,
  cap-gains harvesting / bracket-fill, contribution optimization, MFJ-vs-MFS.
- **T7 — State.** Pluggable state modules; start with the user's state. Brackets
  + federal-conformity rules.
- **T8 — Output.** 1040-style worksheet view + PDF; export the input set to a
  preparer or to drive the Aiwyn MCP.
- **T9 — Extraction.** Lift `lib/tax-engine/` into its own repo/app when ready
  (the boundary above makes this a copy + write a new adapter).

## Testing

Pure functions → straightforward unit/scenario tests. Each tax year ships with
fixture scenarios (e.g. "single, $90k W-2, std deduction" → known tax) checked in
a smoke script, so data-table edits can't silently regress.
