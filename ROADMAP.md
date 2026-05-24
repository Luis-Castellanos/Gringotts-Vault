# Vault Roadmap

> Last updated: 2026-05-23

## Vision

Vault is a personal finance operating system, designed for one user with sophisticated needs:
genuine ownership of financial data, deep and beautiful reporting, audit-grade accuracy, and
zero friction for the workflows that matter.

It exists because Monarch, while excellent, optimizes for the median user. Vault optimizes
for the user who *thinks* about money continuously and wants the tool to reward depth, not
strip it away.

## Design principles

1. **Statements are truth.** Live data is convenience; PDF statements from financial
   institutions are the source of truth. Vault should make both easy and never confuse them.
2. **Reporting is the point.** The job of the tool is to help the user *understand* their
   money, not to nag, gamify, or prescribe.
3. **Anti-prescriptive by design.** Vault doesn't tell you what to do with your money — it
   tells you what you've done. No budget guilt, no spending alerts, no streaks.
4. **Audience of one.** Every design choice is for the person building the tool. No need
   to compromise for a hypothetical median user.
5. **Customizability over defaults.** When in doubt, make it configurable.
6. **Beauty as load-bearing.** "Reporting beauty and depth" is the #1 quality. Charts must
   be polished, layouts must breathe, typography must read.

## Schema conventions

### Transaction sign convention
Amounts reflect the direction money moved relative to the account, regardless of category.
Positive = money in. Negative = money out.

This is independent of which bucket a transaction belongs to (its category's flow_type).
A refund of a clothing purchase is a positive amount in an outflow-flow_type category.
A pay clawback is a negative amount in an inflow-flow_type category.

### Category flow_type
Every category has a `flow_type` of `inflow`, `outflow`, or `transfer`. This determines
which bucket the category lives in for reporting purposes:

- `inflow` — income, gifts, refunds you weren't expecting to be recurring
- `outflow` — spending, cashback adjustments (cashback offsets are outflow rows with positive signs)
- `transfer` — money moving between your own accounts; excluded from spending/income reports

Reports that ask "total spending" sum all amounts where flow_type='outflow' (the positive
cashback rows reduce the total naturally). Reports that ask "income for taxes" sum amounts
where flow_type='inflow' only — cashback isn't there because it lives in outflow.

### Cashback treatment
Cashback is recorded as a single positive-amount transaction in the `Credit Card Cashback`
category, with the card's subcategory (e.g. "Apple Card 7999"). Because flow_type=outflow,
it nets against spending in reports. IRS-correct because cashback is treated as a price
reduction, not income.

## External dependencies

### bank-statement-extractor (Python repo)
https://github.com/Luis-Castellanos/bank-statement-extractor (private)

The canonical extractor for every statement type: checking, savings, credit card,
investment, retirement, loans, mortgages, HSA, 401k, and paystubs. Lives outside
Vault — separate repo, independent release cycle.

**Pipeline:**
1. Extractor parses statement PDFs and appends rows to `master.xlsx`.
2. `master.xlsx` also contains two reference sheets: **Categories** (the full
   taxonomy) and **Vendors** (vendor → category mapping). Categorization happens
   in Excel via Claude Code, mapping each new vendor against the Vendors sheet.
3. Once master.xlsx is clean, Vault's loader imports it.
4. Vault allows post-hoc edits to any field (category, vendor, amount, etc.) but
   is not responsible for first-pass categorization.

**Architectural principle:** the extractor is extraction-only — no categorization
logic. The Categories taxonomy and Vendors list live in Excel for now because
iterating there is faster; they will eventually move into Vault (see Phase 5+).

## Phases

### Phase 1: Foundation (mostly done)

The minimum viable workspace. A working schema, real data loaded, at least one functional
screen.

- ✅ Postgres schema (accounts, categories, transactions, imports, balance_snapshots)
- ✅ Drizzle ORM setup
- ✅ Next.js scaffold with TypeScript and Tailwind
- ✅ XLSX-based import pipeline (`scripts/load-master.ts`)
- ✅ Categories seeded
- ✅ Review Queue screen (single-transaction-at-a-time, suggestions, similar transactions, recently reviewed, click-to-undo)
- ✅ Merchant cleaner (PayPal/Square handling, title-casing, address-tail stripping)
- ✅ Cloud Postgres via Neon (shared between dev machines)
- ✅ GitHub repo, two-machine workflow
- ✅ VS Code + Claude Code as primary dev environment

### Phase 2: Useful (next)

Make Vault genuinely useful as a daily tool. Build the screens that make the data sing.

#### Designed pages (build first, in priority order)

- [ ] **Accounts page** — Monarch-style dedicated main page. Designed in Claude.ai
  artifacts. Highest priority.
- [ ] **Credit Cards page** — Dedicated page (also accessible from Accounts).
  Designed in Claude.ai artifacts; current design supersedes all prior versions.
  Schema additions to the `accounts` table will be determined by the design when
  it lands in this repo.
- [ ] **Payroll page** — Paystub-driven view of income, gross/net, taxes,
  deductions, employer 401k match. Designed in Claude.ai artifacts. Depends on
  the bank-statement-extractor supporting paystubs.

#### Data layer (prerequisites for the reporting pages)

- [ ] **Parser-to-Vault data pipeline.** Vault-side work to consume master.xlsx
  cleanly:
  - Audit `scripts/load-master.ts` against the current xlsx schema
  - Support every account type the extractor emits (checking, savings, credit
    card, investment, retirement, loans, mortgages, HSA, 401k, paystubs)
  - Re-import Chase Checking, Chase Card (Prime/Sapphire/Freedom), and Discover —
    pre-2026-05-16 data from old text-based parsers had wrong signs / dropped rows
  - Run one big catchup import after re-import audit
  - Establish monthly import rhythm (manual `load-master.ts` run is fine for now)
- [ ] **Flow-type taxonomy on categories.** Add `flow_type` enum column to
  categories (inflow/outflow/transfer). Classify all existing categories. Update
  loader to populate flow_type from category. Prerequisite for accurate Cashflow
  and Payroll reporting.

#### Pages still to design (Claude.ai artifacts first, then code)

- [ ] **Dashboard** — net worth, monthly cashflow, top categories, account
  snapshot. Default landing page when you open Vault.
- [ ] **Transactions** — searchable, filterable full ledger. Filters: date range,
  account, category, amount, merchant. Bulk actions (re-categorize, mark as
  transfer).
- [ ] **Cashflow** — income vs spending over time, by category. Drill-down.
  Year-over-year comparisons. Visual emphasis. Depends on flow-type taxonomy.
- [ ] **Net Worth** — assets vs liabilities over time. Account-level detail.

### Phase 3: Anywhere

Make Vault accessible from any device, with reasonable security. Polish the experience.

- [ ] Auth (passwordless / passkey-based, single user)
- [ ] Deploy to Vercel
- [ ] Mobile responsive review screen
- [ ] Mobile responsive dashboard
- [ ] Read-on-phone, edit-on-desktop optimization
- [ ] **PWA support** — manifest, service worker, installable to iOS home screen
- [ ] **Mobile-first review experience** — the iPhone-sized review queue, optimized for thumbs not mice
- [ ] Performance pass (query optimization, caching, response times)

### Phase 4a: Import polish

Make the manual import workflow fast enough that monthly maintenance is a 5-minute task,
not a 1-hour ordeal.

- [ ] Better merchant cleaner (handle international addresses, more processor prefixes)
- [ ] Statement-period reconciliation view ("statements imported: ✓ Apr 2024 ✓ May 2024 ✗ Jun 2024")
- [ ] Duplicate detection improvements
- [ ] Import dry-run / preview before committing
- [ ] Re-clean script as a UI button, not a CLI command

### Phase 4b: Live data layer (deferred, decision pending)

Plaid (or equivalent) as a *delivery mechanism*, not as a source of truth. Live data
populates a "preliminary" zone; statement imports promote transactions to "verified."
Reconciliation tools compare live vs statement data and surface gaps.

- [ ] Decision: is the cost / privacy trade-off worth it?
- [ ] If yes: integrate Plaid for live transaction sync
- [ ] Two-tier transaction state (preliminary / verified)
- [ ] Reconciliation view comparing live data against imported statements
- [ ] Logo enrichment via Plaid metadata

### Phase 5+: Speculative

Ideas for later, in no particular order. May or may not get built.

- [ ] Tags as a cross-cutting label system (separate from categories)
- [ ] **Forecasting** — Projection Labs-style scenario modeling (portfolio growth,
  retirement, savings rate, what-ifs). Placeholder for now; Projection Labs change
  log PDF captured as scoping reference.
- [ ] Anomaly detection ("this category is 3x last month, FYI")
- [ ] Custom report builder (saved queries, parameterized views)
- [ ] CSV/PDF export
- [ ] **Tax engine** — tax-prep-lite tailored to a single accountant's actual
  return. Build vs integrate Aiwyn's tax engine is an open question; annual rules
  updates required either way. Year-end summary view falls out of this naturally.
- [ ] **Investment analysis** — sophisticated breakdowns of brokerage / retirement /
  401k holdings: asset allocation, performance attribution, fees, contributions vs
  growth. Brokerage accounts already in schema; no functionality yet.
- [ ] Subscription tracker (auto-detect recurring charges, surface upcoming renewals)
- [ ] Net worth goals ("you'd hit $X by Y at current rate")
- [ ] **Move Categories taxonomy and Vendors list into Vault.** Today they live
  in master.xlsx because iterating in Excel is fast. Eventually they belong in
  Vault so categorization can be a first-class in-app concept.
- [ ] **Native iOS app** — Swift/SwiftUI, talks to Vault API. Only build if PWA stops being
  enough and you can articulate what's missing. Likely a year+ out.

## Open questions

Decisions to make later. Don't try to answer these prematurely.

- **What does "fixed vs variable" actually look like in the UI?** Per-category flag?
  Per-transaction override? Decide when building the Dashboard.
- **How do recurring charges get detected?** Cadence detection in the merchant-history
  card is a start. Worth elevating to a first-class concept?
- **Multi-currency?** No need today, but if travel / foreign transactions become
  common, a real consideration.
- **Native iOS or PWA-only?** A PWA gets you 80% of the iPhone experience for 5% of the
  work. Native gets you Face ID, widgets, and that "real iPhone app" feeling. Decide
  after using Vault as a PWA for several months — let real usage tell you what's
  missing rather than guessing now.
- **Multi-employer / multi-source income.** When you have multiple income streams
  (job + side gig + investment income), how should the payroll view distinguish them?
  Single chart with segments? Multiple cards? Decide when actually relevant.

## Recently shipped

See [CHANGELOG.md](./CHANGELOG.md) for the full history.
