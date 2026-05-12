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
- [ ] **Accounts** — list of accounts with current balances, ability to edit, mark closed,
  set color/icon.
- [ ] **Flow-type taxonomy on categories.** Add `flow_type` enum column to categories
  (inflow/outflow/transfer). Classify all existing categories. Add new "Credit Card Cashback"
  category with subcategories per card. Update parser/loader to populate flow_type from
  category. Prerequisite for accurate reporting.

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

## Recently shipped

Reverse chronological. The latest thing first.

- 2026-05-11 — Decided on transaction sign convention (sign = direction, category determines bucket) and cashback-as-positive-outflow treatment. Schema migration planned.
- 2026-05-09 — Migrated to Neon cloud Postgres. Both Mac and Windows machines now share one database via shared `.env` connection string.
- 2026-05-09 — Cleaned up Review Queue layout: compact header, fixed-height rail cards, "Recent activity for this merchant" card with summary and history list.
- 2026-05-09 — Improved merchant cleaner to handle PayPal/Square processor prefixes, title-case ALL CAPS strings, and strip address tails. Re-cleaned all existing transactions.
- 2026-05-08 — Recently Reviewed card with click-to-undo. New `/api/transactions/[id]/unreview` endpoint to send transactions back to the queue.
- 2026-05-04 — Initial Review Queue screen built: single-transaction-at-a-time review with suggestions, similar transactions, keyboard shortcuts, bulk apply.
- 2026-05-03 — Schema design completed and ported from SQL to Drizzle. End-to-end tested with 212 real Apple Card transactions.
- 2026-05-02 — Project scaffolded: Next.js 15, React 19, TypeScript, Drizzle ORM, Tailwind v4, local Docker Postgres.
