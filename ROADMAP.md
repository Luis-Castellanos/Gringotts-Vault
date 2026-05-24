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

- `inflow` — income, rewards (credit-card cashback/points), gifts, unexpected refunds
- `outflow` — spending
- `transfer` — money moving between your own accounts; excluded from spending/income reports

Reports that ask "total spending" sum all amounts where flow_type='outflow'. Reports that
ask "total income" sum amounts where flow_type='inflow'. flow_type comes straight from the
master file's `Type` column (Inflows / Outflows / Transfers) on every import.

### Cashback treatment
Credit-card cashback and points live under **Inflows → Rewards & Bonuses → Credit Card
Cashback/Points** and count as income in net cashflow. (This supersedes the earlier
price-reduction-outflow treatment; changed 2026-05-23 alongside the master-file taxonomy
overhaul, in favor of a simpler net-cashflow view.)

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

- [x] **Credit Cards page** — shipped 2026-05-23. Phase A: list + grid views
  (grid default), drag-to-reorder with localStorage persistence, sort
  dropdown, click-to-open detail modal, inline-editable Card name / Institution /
  Last 4 / Credit limit / APR / Opened (server-validated against earliest
  transaction), Mark-as-closed + Re-open, Add Card via Monarch-style flow.
  Schema added: `accounts.credit_limit`, `accounts.apr` (Phase B start).
  Card name is now DB-backed (dropped LS nickname pattern).
- [x] **Accounts page** — shipped 2026-05-23. Phase A: list + grid views
  (grid default), NW area chart from cumulative transaction history with
  range toggle including custom date range, composition stacked bar, grouped
  sections (Cash / Investments / Liabilities) with sub-groups, credit cards
  aggregated into one row that links to /credit-cards, 12-week per-account
  sparklines, sort dropdown, per-subgroup drag-to-reorder, Monarch-style
  2-step Add Account flow (category picker → form), asset detail modal
  (editable name/institution/last4/opened with same validation), Show/Hide
  closed accounts toggle, Mark-as-closed + Re-open on both views.
  Type-specific fields (APY for savings, gain% for brokerage, monthly payment
  for loans) deferred to future schema migrations.
- [x] **Payroll page** — shipped 2026-05-23 (Phase A). Three tabs: Single stub
  (hero + interactive donut + Earnings / Deductions / Taxes / Employer cards
  + Imputed footnote, prev/next nav), All stubs (table with year filter and
  event chips), YTD summary (year picker, big hero, 4 colored metric cards,
  monthly stacked bar chart with event dots + hover tooltip, Saved+Invested,
  Year events timeline, full tax breakdown). **Phase A data is hardcoded** in
  `lib/payroll/data.ts` (13 stubs from the design handoff). When the
  bank-statement-extractor adds paystub support, swap that file for a server
  query against a `paystubs` table — `computeStub` and `computeYTD` port
  straight over.

#### Data layer (prerequisites for the reporting pages)

- [x] **Parser-to-Vault data pipeline** — overhauled 2026-05-23 for the new
  master.xlsx schema. `load-master.ts` now (1) syncs the full taxonomy from the
  `Categories` sheet (Type → flow_type, Category → parent, Sub-category → child,
  with Type-prefixed slugs so repeats like Zelle/Check/Other stay unique), and
  (2) reads the per-row `Type` column for flow_type / isTransfer. One clean reset
  + re-import loaded all **9,746 transactions** (0 unmatched, 0 needing review),
  fixing the old sign issues. Monthly rhythm = re-run `db:load-master`. Read-only
  audit helpers added: `inspect-master`, `inspect-taxonomy`, `check-mapping`.
  - [ ] **Account-identity reconciliation** (follow-up) — the re-import created
    duplicate label-accounts because master labels (e.g. "Chase Prime 5944")
    don't match preloaded names ("Chase Prime Visa"). Merge the 5 dupes into
    their preloaded accounts and make `getOrCreateAccount` match by last-4 +
    disambiguation. Does NOT affect Cashflow.
  - [ ] Per-type fields (APY, brokerage gain%, loan monthly payment) still deferred.
- [x] **Flow-type taxonomy on categories** — done 2026-05-23. `flow_type` enum
  (inflow/outflow/transfer) added to categories and populated directly from the
  master file's `Type` column on every import. Powers Cashflow.

#### Pages still to design (Claude.ai artifacts first, then code)

> All of these now have live **under-development placeholder routes** (shared
> `UnderDevelopment` component) so the nav is never dead-ended. Transactions
> shipped a real Phase A directly (below); the rest still need a design pass.

- [x] **Transactions** — shipped 2026-05-23 (Phase A). Server-loaded last 200
  transactions, date-grouped list with vendor logos (Clearbit + colored-initials
  fallback), multi-tab Filters modal (Categories hierarchy / Merchants / Accounts
  / Date / Amount / Other), search, sort, and inline expand-to-edit
  (merchant / category / notes / transfer / needs-review) saved via the PATCH +
  categorize endpoints. Still TODO: pagination beyond 200 rows, bulk actions
  (re-categorize, mark-as-transfer), saved filter views.
- [ ] **Dashboard** — placeholder route live. Real page still to design: net
  worth headline + sparkline, monthly cashflow snapshot, top categories, account
  snapshot. Default landing page when you open Vault.
- [x] **Cashflow** — shipped 2026-05-23 (Phase A). Income-vs-spending chart
  (income/expense bars + net-line overlay) with Monthly / Quarterly / Yearly
  toggle, click/prev-next period selection + hover tooltip, selected-period
  summary tiles (Income / Expenses / Net Savings / Savings Rate), and Income +
  Expenses breakdown lists with a Category / Group toggle and proportional bars.
  Adapted from Monarch's Cash Flow design into Vault's palette. Still TODO:
  Merchant breakdown dimension, account/date filters, older-data scroll, YoY.
- [ ] **Net Worth** — placeholder route live. Assets vs liabilities over time.
  Account-level detail.

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

> Several of these have live **under-development placeholder routes** already
> (Reports, Rental Properties, Investments, Tax, Forecasting) — the nav surfaces
> them under "Not started" so the shape of the eventual product is visible.

- [ ] **Rental Properties** — treat each property as its own small business:
  per-property income (rent) and expenses (mortgage, taxes, insurance, repairs,
  management fees), monthly/annual cash flow, equity built + mortgage payoff
  progress, depreciation schedule tracking, return metrics (cap rate,
  cash-on-cash, total ROI), tenant/lease info (lease dates, deposit held, rent
  escalations), and a portfolio roll-up across all properties. Placeholder route +
  nav item are live; no data source yet.

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
