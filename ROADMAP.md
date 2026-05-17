# Vault Roadmap

> Last updated: 2026-05-11

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

The canonical PDF-to-xlsx extractor. Lives outside Vault — separate repo,
independent release cycle. Vault depends on its output format (the
10-column Transactions sheet in master.xlsx). Material changes to the
parser's output schema require coordinating updates to Vault's loader.

**Architectural principle: the parser is extraction-only.** It emits raw
merchant strings + signed amounts. Categorization, normalization, and
reporting all happen in Vault. Do NOT add categorization logic to the
parser; if rule lookup or AI categorization is needed at ingest time,
it belongs in Vault's loader or a separate Vault categorization service.

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

Make Vault genuinely useful as a daily tool. Build the screens that make the data sing,
plus the categorization system that scales beyond manual review.

- [ ] **Merchant Rules** — auto-categorize at import time. Rules can be created explicitly
  or implicitly (when categorizing in the review queue, optionally save as a rule for
  future imports).
- [ ] **Dashboard** — net worth, monthly cashflow, top categories, account snapshot.
  Default landing page when you open Vault.
- [ ] **Transactions** — searchable, filterable full ledger. Filters: date range, account,
  category, amount, merchant. Bulk actions (re-categorize, mark as transfer).
- [ ] **Cashflow** — income vs spending over time, by category. Drill-down. Year-over-year
  comparisons. Visual emphasis.
- [ ] **Income / Payroll view** — Dashboard widget showing YTD net income, latest
  paycheck, breakdown by source. Click expands to full "Income" page with year-over-year,
  monthly trends, paycheck history. Mobile and desktop equally polished. Net only
  (gross/tax/deductions deferred to Phase 5+).
- [ ] **Net Worth** — assets vs liabilities over time. Account-level detail.
- [ ] **Credit Cards page** (also accessible as a section on general Accounts page).
  Designed via Claude artifacts on 2026-05-17. Reference designs: `vault_credit_cards_v6`
  (list view) and `vault_card_detail_drawer_final` (per-card drawer).

  List page structure:
  - 4 top metrics: Total Limit, Total Balance, YTD Cashback, Annual Fees (with net-of-cashback sub-line)
  - Full-width Total Utilization bar with 30%/50% threshold markers
  - Active cards section, sortable + filterable, list/grid toggle (real card art scraped from issuer marketing)
  - Closed & hidden collapsible section at bottom (dimmed art, gray names, closure date, no util bar)

  Per-card drawer (slide-in from right):
  - Header: card art, name, open date, APR, annual fee
  - Balance + utilization (charge cards display "no preset limit" and skip util math)
  - Lifecycle cards: signup bonus progress, annual fee, anniversary — each with status pill (green/amber/red/neutral) and inline metadata
  - Recent transactions (3-5 rows, "View all →" links to Transactions filtered by card)
  - Cashback/points earned section, monthly bars + YTD/lifetime totals

  Schema additions for the `accounts` table (or a new `credit_cards` extension table):
  - `annual_fee` (decimal)
  - `apr` (decimal)
  - `open_date` (date)
  - `closed_date` (date, nullable)
  - `signup_bonus_amount` (decimal or int for points)
  - `signup_bonus_deadline` (date, nullable)
  - `signup_bonus_spent_to_date` (decimal, derived from transactions)
  - `rewards_type` (enum: 'cashback' / 'points')
  - `account_subtype` (enum: 'revolving' / 'charge') to distinguish charge cards
  - `is_hidden` (bool, separate from closed)

  Anti-prescriptive constraint: the drawer shows raw data and calculations, never recommends actions
  ("you should spend X to break even" was explicitly rejected during design).
- [ ] **Flow-type taxonomy on categories.** Add `flow_type` enum column to categories
  (inflow/outflow/transfer). Classify all existing categories. Add new "Credit Card Cashback"
  category with subcategories per card. Update parser/loader to populate flow_type from
  category. Prerequisite for accurate reporting.
- [ ] **Python-parser-to-Vault data pipeline.** Python statement-extractor
  (https://github.com/Luis-Castellanos/bank-statement-extractor, private)
  is the canonical PDF parser. Extraction-only by design — emits cleaned,
  validated, sign-correct transactions with Category and Sub-category
  intentionally BLANK. Vault is the categorization layer (see Phase 2 item
  below). Parser output: master.xlsx at the Tracing project root, 10
  columns (Date, Account, Account #, Source, Category, Sub-category,
  Amount, Balance, Stmt period, Source file). Dedup key:
  (Date, Account, Source, Amount). Sum-validation safety net means bad
  PDFs stay in inbox/ and don't reach master.xlsx — Vault's loader can
  trust what arrives.

  Remaining work:
  - Audit and update scripts/load-master.ts against current xlsx schema
  - Add the 6 new account types to Vault's accounts table (Amex Gold 1001,
    Amex Checking 0226, Amex HYSA 4953, BOA Card 6601, Citi Simplicity 6772,
    Capital One 360 9865)
  - Re-import Chase Checking, Chase Card (Prime/Sapphire/Freedom), and
    Discover data — old text-based parsers produced wrong signs/dropped rows
    pre-2026-05-16; data ingested before today from those issuers is suspect
  - Run one big catchup import after re-import audit complete
  - Establish monthly import rhythm (current plan: run `load-master.ts`
    manually after each parser run; revisit if friction grows)
- [ ] **Categorization layer.** Master.xlsx arrives with Category and
  Sub-category blank — this is intentional in the parser. Vault owns
  categorization. Open design questions:
  - Where do rules live (Postgres table, YAML file, Excel sheet I edit)?
  - How are rules authored/edited (Vault admin UI, direct DB, external)?
  - AI categorization strategy (rules-first with AI fallback for unmatched,
    or AI primary, or no AI)?
  - Handle the [Card XXXX] prefix on Amex authorized-user transactions —
    rules that anchor on Source start need to account for this
  - How to preview/audit categorization before commit

  Defer concrete design until parser pipeline is wired and historical
  data is loaded. Categorize-as-separate-pass is fine for v1; UX can
  improve from there.

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
- [ ] Simple forecasting (project next 12 months from last 12)
- [ ] Anomaly detection ("this category is 3x last month, FYI")
- [ ] Custom report builder (saved queries, parameterized views)
- [ ] CSV/PDF export
- [ ] Year-end tax summary view
- [ ] Subscription tracker (auto-detect recurring charges, surface upcoming renewals)
- [ ] Net worth goals ("you'd hit $X by Y at current rate")
- [ ] **Pay stub parser** — ingest pay stubs as a separate source, surface gross income /
  tax withholding / deductions / employer 401k match. Reconcile against bank deposits to
  verify net amounts. Unlocks full Gusto-style payroll breakdown.
- [ ] **Native iOS app** — Swift/SwiftUI, talks to Vault API. Only build if PWA stops being
  enough and you can articulate what's missing. Likely a year+ out.

## Open questions

Decisions to make later. Don't try to answer these prematurely.

- **Plaid or no Plaid?** Statements are truth. Plaid is convenience. Worth the cost,
  privacy trade-off, and maintenance burden? Decide after Phase 3 is stable.
- **What does "fixed vs variable" actually look like in the UI?** Per-category flag?
  Per-transaction override? Decide when building the Dashboard.
- **How do recurring charges get detected?** Cadence detection in the merchant-history
  card is a start. Worth elevating to a first-class concept?
- **Multi-currency?** No need today, but if travel / foreign transactions become
  common, a real consideration.
- **Investment tracking?** Brokerage accounts in the schema, but no actual functionality
  yet. Worth building? Or trust Fidelity / Schwab / etc. for that?
- **Native iOS or PWA-only?** A PWA gets you 80% of the iPhone experience for 5% of the
  work. Native gets you Face ID, widgets, and that "real iPhone app" feeling. Decide
  after using Vault as a PWA for several months — let real usage tell you what's
  missing rather than guessing now.
- **Multi-employer / multi-source income.** When you have multiple income streams
  (job + side gig + investment income), how should the payroll view distinguish them?
  Single chart with segments? Multiple cards? Decide when actually relevant.
- **Closed vs hidden card states.** Currently designed as a single "Closed & hidden" bucket.
  Possible later split: "open but inactive" (paused, kept for credit history) vs "closed"
  (permanently dead). Defer until real usage reveals whether the distinction matters.
- **Card art sourcing.** Real card images scraped from issuer marketing for popular cards
  (Apple Card, Sapphire, Amex Gold, etc.). Stored locally, referenced by card. Need a fallback
  strategy for less-common cards (generated gradient + network logo + last 4 as v1).

## Recently shipped

Reverse chronological. The latest thing first.

- 2026-05-17 — Got handoff brief from parser-conversation Claude Code
  covering current parser output schema, supported issuers (11 now, was 5),
  categorization architecture (none — extraction-only by design), and
  the Chase/Discover historical-data integrity issue. Roadmap updated
  to match reality.
- 2026-05-17 — TypeScript parser scaffolding explored, then parked on
  `explore/ts-parser` branch. Pivoted to Python-parser-as-canonical
  strategy: extraction stays in Python (separate repo), Vault becomes
  the reporting consumer of cleaned xlsx output.
- 2026-05-17 — Credit Cards page designed end-to-end via Claude artifacts (list + drawer, 7 iterations).
  Schema implications and lifecycle field requirements captured in Phase 2.
- 2026-05-11 — Decided on transaction sign convention (sign = direction, category determines bucket) and cashback-as-positive-outflow treatment. Schema migration planned.
- 2026-05-09 — Migrated to Neon cloud Postgres. Both Mac and Windows machines now share one database via shared `.env` connection string.
- 2026-05-09 — Cleaned up Review Queue layout: compact header, fixed-height rail cards, "Recent activity for this merchant" card with summary and history list.
- 2026-05-09 — Improved merchant cleaner to handle PayPal/Square processor prefixes, title-case ALL CAPS strings, and strip address tails. Re-cleaned all existing transactions.
- 2026-05-08 — Recently Reviewed card with click-to-undo. New `/api/transactions/[id]/unreview` endpoint to send transactions back to the queue.
- 2026-05-04 — Initial Review Queue screen built: single-transaction-at-a-time review with suggestions, similar transactions, keyboard shortcuts, bulk apply.
- 2026-05-03 — Schema design completed and ported from SQL to Drizzle. End-to-end tested with 212 real Apple Card transactions.
- 2026-05-02 — Project scaffolded: Next.js 15, React 19, TypeScript, Drizzle ORM, Tailwind v4, local Docker Postgres.
