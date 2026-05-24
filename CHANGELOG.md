# Vault Changelog

Reverse chronological. The latest thing first.

- 2026-05-24 — **UI iteration pass (accounts, categories, payroll, cashflow,
  transactions).** Accounts settings page: grouped Assets/Liabilities → type
  sub-groups, institution logos, click-to-expand detail, editable Type (re-files
  the account), per-type fields (APY / loan terms / subtype), grid + list views
  with quick remove, expand/collapse all. Credit Cards made view-only (nickname
  rename kept). Transactions infinite-scroll + total count. Categories: card grid
  → multi-column flow (no gaps / no truncation) + collapsibility + expand/collapse
  all. Payroll single-stub trimmed to fit one viewport; voucher/salary removed
  from the stub bar. Cashflow: date-range presets + paging (reaches 2019),
  breakdown redesigned as full-row bars. Redundant page-title headers removed;
  Accounts & Categories widened to full width. Clean-slate scripts: db:reset /
  db:reset:all.

- 2026-05-24 — **Accounts restructure, view-only Credit Cards, Transactions
  infinite scroll, per-type fields.** Split the old Accounts page: the net-worth
  reporting view moved to **/net-worth** (read-only); **/accounts** is now a
  settings page — collapsible sections, institution logos, click-to-expand
  per-account detail with inline edit, add, delete, and **merge** (fixes the
  duplicate accounts). **Credit Cards is view-only** (nickname rename kept);
  account add/remove/edit lives only on /accounts. Added account `DELETE` + merge
  API and a unique-last-4 loader match so imports stop creating duplicates. New
  **per-type account fields**: APY (cash/savings), interest rate / monthly payment
  / original principal / maturity (loans), subtype (brokerage/retirement) — via
  `migrate-account-fields.ts`. **Transactions infinite-scrolls** with a total
  count (`GET /api/transactions`). Clean-slate scripts: `db:reset` / `db:reset:all`.
  Nav: Accounts → Manage; Net Worth → Complete; Cashflow → Under development.
- 2026-05-24 — **Categories management page + mutation API.** New `/categories`
  page: the full taxonomy grouped by Inflows / Outflows / Transfers, parent→child
  tree with transaction counts, and add / rename / delete (guarded) / merge
  actions. Merge reassigns all of a category's transactions into another
  (isTransfer follows the target's flow_type) with optional delete-after. New
  API: POST /api/categories, PATCH + DELETE /api/categories/[id], and
  POST /api/categories/[id]/reassign. Added to a new "Manage" sidebar group.
  Caveat: `load-master.ts` still upserts the taxonomy from master.xlsx on import,
  so edits to master-defined categories can be overwritten on the next import.
- 2026-05-23 — **Data-pipeline overhaul + Cashflow page shipped (Phase A).**
  Master.xlsx grew a 3-tier taxonomy (Type → Category → Sub-category, 102 rows)
  and a per-row `Type` column. Added a `flow_type` enum (inflow/outflow/transfer)
  to categories and rewrote `load-master.ts` to sync the full taxonomy from the
  Categories sheet (Type-prefixed slugs) and read `Type` per row. One clean reset
  + re-import replaced the 212-row test seed with all **9,746 transactions**
  (0 unmatched, 0 review). Cashback moved Inflows → counts as income (net-cashflow
  view; supersedes the price-reduction treatment). New Cashflow page: income vs
  spending chart with net-line overlay, Monthly/Quarterly/Yearly toggle, period
  selection + hover tooltip, summary tiles, and Income/Expenses breakdowns with a
  Category/Group toggle — adapted from Monarch's design into Vault's palette.
  Known follow-up: the re-import created 5 duplicate label-accounts (master labels
  ≠ preloaded names); account-matching fix tracked for next. Read-only audit
  helpers added (`inspect-master`, `inspect-taxonomy`, `check-mapping`,
  `cashflow-sanity`).
- 2026-05-23 — **Transactions page shipped (Phase A) + nav/sidebar overhaul.**
  Transactions: server-loaded last 200 rows, date-grouped list with vendor logos
  (Clearbit + colored-initials fallback), multi-tab Filters modal (Categories
  hierarchy / Merchants / Accounts / Date / Amount / Other), search, sort, and
  inline expand-to-edit (merchant / category / notes / transfer / needs-review)
  saved via PATCH + categorize endpoints. A shared `UnderDevelopment` placeholder
  component now backs every not-yet-built route — Dashboard, Cashflow, Net Worth,
  Reports, Rental Properties, Investments, Tax, Forecasting — so the nav is never
  dead-ended. Sidebar rebuilt Monarch-style: hideable via a new sticky TopBar
  hamburger + in-sidebar collapse, drag-to-resize handle (200–420px, persisted to
  localStorage), top action row (logo + Search/Bell/Settings), real SVG nav icons,
  status groups (Complete / Under development / Not started). Dark-mode tokens
  warmed to the cream-on-taupe artifact palette; shared modal styles lifted to
  globals.css. Payroll Single Stub relaid out to a 3-column grid that fits one
  viewport. Note: sidebar still buckets Payroll + Transactions as "Under
  development" even though both shipped Phase A — a UX label, not a status error.
- 2026-05-23 — **Payroll page shipped (Phase A).** Three tabs: Single stub with
  hero + 3-slice interactive donut + breakdown cards, All stubs table with year
  filter, YTD summary with year picker + 4 metric cards + monthly stacked bar
  chart with event timeline. Data is hardcoded in `lib/payroll/data.ts` (13
  stubs from the design handoff); swap for a `paystubs` table query when the
  bank-statement-extractor adds paystub support.
- 2026-05-23 — **Accounts page shipped + Credit Cards expanded (Phase A).**
  Accounts: list + grid views (grid default), NW chart from cumulative
  transactions with custom date range, composition bar, grouped sections with
  per-bucket drag-to-reorder, Monarch-style Add Account flow (category picker
  → form), asset detail modal with editable name/inst/last4/opened (server-
  validated against earliest transaction), Mark-as-closed + Re-open in both
  views, Show/Hide closed accounts toggle, sort dropdown, sparklines per
  account. Credit Cards: grid view added (default), drag-to-reorder, detail
  modal opened by clicking a grid card, "Manual" sort option added and made
  default, Card name backed by DB (dropped LS nickname), inline-editable
  Institution + Last 4 alongside existing Credit limit / APR / Opened.
- 2026-05-23 — **Credit Cards page shipped (Phase A).** Initial build: list
  view with inline expansion (Card info + Balance · this cycle + Benefits +
  Rewards & fees + Close action), editable Credit limit / APR / Opened with
  server-side validation, Add Card modal, light/dark theme system added to
  globals.css, ThemeProvider + toggle in Sidebar, real PNG card art via
  `next/image` with quality=95 for retina sharpness, README dev-server
  instructions rewritten for step-by-step clarity. Schema added:
  `accounts.credit_limit`, `accounts.apr`.
- 2026-05-23 — Roadmap audit and restructure. Pulled paystub parser into Phase 2
  (bank-statement-extractor now covers all statement types including paystubs).
  Clarified data pipeline: categorization happens in `master.xlsx` (Categories +
  Vendors sheets) via Claude Code; Vault is post-hoc edit only. Removed in-Vault
  Merchant Rules / Categorization Layer items — moving taxonomy + vendors into
  Vault is now a Phase 5+ goal. New Phase 2 pages added: Accounts (Monarch-style,
  highest priority), Credit Cards (new design supersedes `vault_credit_cards_v6`
  + drawer), Payroll (paystub-driven). New Phase 5+ goals: Projection Labs-style
  forecasting, tax engine (build vs Aiwyn integration TBD), sophisticated
  investment analysis. Recently Shipped log moved to this file.
- 2026-05-18 — Process decision: remaining Phase 2 page frontends (Income,
  Dashboard, Transactions, Cashflow, Net Worth, Accounts) will be designed
  in Claude artifacts first, then brought to Claude Code for adaptation to
  real Drizzle queries + project conventions. Validated against the Credit
  Cards page workflow (7 artifact iterations → final v6). Existing Credit
  Cards designs (`vault_credit_cards_v6`, `vault_card_detail_drawer_final`)
  are settled and not subject to re-design.
- 2026-05-17 — Preloaded all 25 active accounts (11 credit cards including
  Venmo Visa, 14 checking/savings/cash). Hardened `load-master.ts`: trusts
  the `Account #` column over regex-parsing the `Account` label; bulk INSERT
  with ON CONFLICT DO NOTHING for the catchup-import performance hit.
  Documented the balance-derivation-from-transactions strategy in the
  schema (`balance_snapshots` stays dormant for cases where transaction
  history is incomplete, e.g. brokerage/retirement). Established card-art
  convention: slug-derived filenames in `public/card-art/`. 9 of 11
  credit-card images landed (missing: Citi Simplicity, Gain Mastercard).
  Bank-logos convention decided: `public/bank-logos/<slug>.png` where
  `<slug>` is the slugified full institution string (no logos sourced yet).
  Parked `explore/ts-parser` branch pushed to origin for preservation.
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
