# Real Estate → rental-business module (Stessa-parity) — scoping plan

> Status: **proposed** (2026-05-25). Plan-first; foundation not yet built.
> Goal: bring `/rentals` to Stessa parity — rent roll, maintenance, full
> financial reports incl. **Schedule E**, and the standard return metrics.
> Reference: Stessa screenshots in `reference/` + stessa.com.

## Target feature set (from Stessa)

Stessa's left nav and Reports screen map directly to what we want:

- **Reports** (filter by property · date range · interval · category; export Excel/PDF):
  Income Statement (P&L), **Net Cash Flow**, Balance Sheet, Schedule of Capital
  Expenses, Stress Test, and a **Tax Package / Schedule E**.
- **Rent Roll** — active leases + unit details (tenant, rent, term, deposit, status).
- **Maintenance** — work orders / requests (property, status, cost, vendor, dates).
- **Return metrics** — Cap rate, Cash-on-cash, NOI, plus the usual ROI / GRM / DSCR.

## The one dependency everything needs

All of the above require **per-property income & expense data**, categorized into a
**rental chart of accounts** that maps to **Schedule E**. Today Vault transactions
have no property link and use the general category taxonomy. So the foundation is:

1. **`transactions.property_id`** (nullable FK) — attribute a transaction to a property.
   - **Decision (the main fork):** how do transactions get attributed?
     - (a) **Manual tag** — a "Property" picker on the transaction (like category). Simple, always works.
     - (b) **By account** — a property owns dedicated account(s) (its checking, its mortgage/escrow); any transaction on those rolls to the property. Powerful, low-touch, but needs a property↔accounts mapping.
     - (c) **Rules** — auto-assign by merchant/account/memo.
     - **Recommend (a)+(b):** dedicated-account rollup as the default, manual tag as the override. The mortgage split already gives us principal/interest/escrow attributable via the property's mortgage+escrow accounts.
2. **Schedule E category mapping** — map categories → Schedule E lines (see below).
   Either tag categories with a `schedule_e_line`, or keep a mapping table.

## Schedule E mapping (IRS Form 1040 Schedule E, Part I)

Income: **Rents received** (line 3). Expenses by line:
1 Advertising · 5 Auto & travel · 6 Cleaning & maintenance · 7 Commissions ·
8 Insurance · 9 Legal & professional · 10 Management fees · 11 Mortgage interest ·
12 Other interest · 13 Repairs · 14 Supplies · 15 Taxes · 16 Utilities ·
17 Depreciation · 18 Other. → A "Tax Package" export produces a per-property
Schedule E worksheet (income, each expense line, depreciation) as Excel/PDF.

## Return metrics (formulas + inputs)

| Metric | Formula | Inputs we have / need |
|---|---|---|
| **NOI** | rental income − operating expenses (excl. debt service + capex) | needs attributed income/expenses |
| **Cap rate** | NOI ÷ purchase price (or market value) | NOI + acquisitionPrice/marketValue ✓ |
| **Cash-on-cash** | (NOI − annual debt service) ÷ cash invested | NOI + mortgage P&I ✓ + **cash invested** (new field: down payment + closing) |
| **DSCR** | NOI ÷ annual debt service | NOI + mortgage payment ✓ |
| **GRM** | price ÷ gross annual rent | price ✓ + rent (from rent roll) |
| **Total ROI** | (cash flow + principal paydown + appreciation) ÷ cash invested | all derivable once income/expenses + cash invested exist |
| **Equity / LTV / appreciation** | value − loan; loan ÷ value; value − purchase | **already have these today** |

## Proposed data model (new)

- `transactions.property_id uuid → properties.id` (nullable).
- `properties`: add `cash_invested`, `units` (int, for multi-unit), and value-history later.
- `property_accounts` (optional, for attribution-by-account): (property_id, account_id, role).
- `leases` — id, property_id, unit, tenant_name, contact, rent_amount, deposit, start, end, status, notes. (Rent roll reads this.)
- `maintenance` — id, property_id, title, status (open/in-progress/done), category, vendor, cost, opened_at, completed_at, notes.
- Category → Schedule E: a `schedule_e_line` column on categories, or a small mapping table seeded for the rental chart of accounts.

## Phasing

1. ✅ **Attribution + per-property financials — shipped 2026-05-25.**
   `transactions.property_id` (manual tag in the transaction editor) + account-rollup
   (a property's mortgage/escrow accounts), and a property-detail **Financials**
   section: income/expense by category, monthly cash-flow chart, net cash flow.
   Folds in non-transfer split parts (mortgage interest). `lib/properties/financials.ts`.
   *Unblocks everything below.* (NOI/return metrics = Phase 2.)
2. ✅ **Return metrics — shipped 2026-05-25.** A **Returns (TTM)** section on the
   property detail: NOI (income − operating exp.), Cap rate (NOI ÷ value),
   Cash-on-cash, and DSCR — from trailing-12-month financials + mortgage terms.
   Used a **down-payment proxy** (purchase − original loan) for cash invested
   rather than adding a `cash_invested` field (avoids a schema change). _Still
   could add:_ explicit `cash_invested`, GRM, total-ROI breakdown, portfolio roll-up.
3. **Rent roll** — `leases` model + a Rent Roll view (portfolio + per-property);
   rent income flows into the financials.
4. **Maintenance** — `maintenance` model + a per-property + portfolio list/board.
5. **Reports + Schedule E export** — a Reports surface for `/rentals` (Net Cash Flow,
   Income Statement, Schedule E) with Excel export (reuse the xlsx export pattern),
   filterable by property/date/interval.
6. **Capital expenses + depreciation** — capex schedule + straight-line depreciation
   (27.5-yr residential) feeding Schedule E line 18.

## Open decisions for sign-off
1. **Attribution model** — recommend account-rollup + manual tag (above). OK?
2. **Rental chart of accounts** — add Schedule-E-aligned rental categories to the
   taxonomy, or map existing categories to Schedule E lines? (Recommend: a Schedule-E
   line tag on categories so existing data maps without re-categorizing.)
3. Build order — recommend the phasing above (financials first, since rent
   roll/maintenance/Schedule E/returns all read it).

## Sources
- [Stessa overview (Software Advice)](https://www.softwareadvice.com/property/stessa-profile/)
- [Investment Property Metrics FAQ — Stessa](https://support.stessa.com/en/articles/11146447-investment-property-metrics-faq)
- [Improved Financial Reports — Stessa](https://www.stessa.com/blog/rental-property-financial-reports-web-mobile/)
