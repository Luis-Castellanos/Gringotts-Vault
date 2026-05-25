# Vault Changelog

Reverse chronological. The latest thing first.

- 2026-05-25 — **Faster upload/ingest (parallel parse).** The upload route
  (`app/api/documents/upload`) processed files strictly sequentially — store →
  spawn Python parser → ingest, one at a time — so a bulk import idled on
  independent subprocess spawns. Now two-phase: **(1) parse in a bounded parallel
  pool** (`PARSE_CONCURRENCY`, default 6; the per-file Python + `pdftotext` spawn
  is the bottleneck and is independent per file — `runExtractor` already uses a
  unique temp dir per call, so it's race-safe), then **(2) ingest serially** so
  `getOrCreateAccount`'s check-then-insert can't race into duplicate accounts.
  The vendor map (~4k `vendor_rules`) is now loaded **once per batch** via
  `loadIngestMaps()` instead of reloaded per file. In-batch byte-identical
  duplicates still report as `duplicate` (preserved via a per-batch hash map).
  Measured on real stored statements (`scripts/bench-parse.ts`, new read-only
  tooling): **~5x faster parse** — 80 files 7.4s → 1.4s serial→parallel.
- 2026-05-25 — **Page-responsiveness perf pass (app-shell + skeletons + parallel
  queries).** Navigation used to freeze the whole view: every page rendered its
  own `<Sidebar/>` inside a `force-dynamic` route that fetched serially with no
  loading UI, so each click tore down the sidebar and waited on the next page's
  queries before painting. Three fixes: (1) **App-shell layout** — `TopBar` +
  `Sidebar` + the centering wrapper moved into `app/layout.tsx`, so navigation
  swaps only the content and the rails stay mounted (no `reviewCount` threading
  needed — the prop was unused, so the Sidebar is a pure client component). All 19
  pages dropped their wrapper and now return just their `<main>`. (2) **`loading.tsx`
  skeletons** — 11 routes get an instant content placeholder while server data
  loads (sidebar stays put): tailored skeletons for Transactions / Net Worth /
  Cashflow that mirror their real toolbar/chart/row layout, generic for the
  lighter data pages; the 8 static pages render instantly and get none. New
  theme-aware `.skeleton` shimmer + `components/Skeleton.tsx`. (3) **Parallelized
  queries** with `Promise.all` — Transactions 5→1, Credit Cards 4→1, Net Worth /
  Accounts 3→1, Settings 6→1, Categories 2→1, Files 3-of-4, Account detail folds
  its category list into the existing batch. Still open (deferred): general
  `revalidate`/caching for semi-static data, and the separate Phase 4a ingest-speed
  work.
- 2026-05-24 — **Durable categorization: rule tier at ingest + smarter merchant
  cleaner.** Added a shared rule set (`lib/categorize/rules.ts`) that classifies
  the raw statement text — transfers (credit-card payments, account/investment
  moves, Zelle, student loan), ATM, income, and fees deterministically; common
  spend by keyword — with transfer direction taken from the amount sign. Wired
  into ingest as **tier 2** (after the vendor-map exact match, before
  Uncategorized): high-confidence hits auto-confirm, spend guesses are suggested,
  and vendor-map hits now also set `is_transfer` correctly. `cleanMerchant` now
  strips the leading `MM/DD(/YYYY)` date, `Card Purchase` / `Payment Sent|Received`
  wrappers, trailing `Web ID:` / `PPD ID:` / `Transaction#:` processor IDs, and the
  PayPal wrapper (`Paypal Inst Xfer <merchant>` → `<merchant>`) — collapsing the
  fragmentation that had pinned the vendor-map hit rate at ~49%. A one-time bulk
  pass (`scripts/categorize-vault.ts`) took the loaded Chase ledger from **49% →
  94%** categorized (review backlog 1,809 → 228). New read-only tooling:
  `categorization-audit.ts`, `cat-export.ts`.
- 2026-05-24 — **Chase parser balance-chain rewrite + Files page filtering/bulk-
  delete.** `parse_chase_checking` now derives each amount from the printed
  **running balance** (`amount[i] = balance[i] - balance[i-1]`), bounded by
  Chase's `*start*/*end*transaction detail` markers, so pdftotext-reflowed deposit
  rows (the amount detached onto its own line) are **recovered instead of
  dropped**; the legacy two-number path is kept as a fallback. Validated on 77
  real Chase statements: **71 reconcile** (was 63), 0 blank balances, 0 gaps — the
  systematic detached-deposit bug (e.g. a statement that had silently dropped
  $4,300 of deposits) is fixed. 6 small pre-existing residuals remain, recorded
  under ROADMAP "Statement audit page" to troubleshoot later. **Files page** gained
  facet filters (Status / Document type / Account, multi-select with counts),
  shift-click range selection, row-selection highlight, and a proper bulk-remove
  modal with the **file-only vs file + data** choice — so a subset can be isolated
  and deleted precisely. New read-only tooling: `verify-parse.ts` (re-parse +
  reconcile every stored statement).
- 2026-05-24 — **Statement audit-field capture + parser robustness.** The parser
  now reconstructs *and self-verifies*: `extract_statement_summary` captures each
  statement's stated control totals (period start/end, beginning/ending balance,
  deposit/withdrawal totals) and the per-row **running balance** is persisted —
  stored on `imports` + `transactions.balance` (migration
  `scripts/migrate-audit-fields.ts`). Fixed two detection/parse bugs surfaced by a
  real 77-statement Chase import: (1) Chase's **2025 layout** pushes
  `TRANSACTION DETAIL`/`CHECKING SUMMARY` past the 5000-char head window, so
  `detect_issuer` now scans the full body (one statement had silently deferred);
  (2) the summary money regex now handles the `-$146.88` sign/symbol ordering, so
  **overdrawn (negative) balances** extract. New read-only tooling:
  `audit-preview.ts` (per-statement stated-vs-derived reconciliation + coverage
  gaps), `doc-status.ts`, `diagnose-doc.ts`, `dump-doc-text.ts`, and
  `reprocess-deferred.ts` (re-parse stored deferred/failed docs after a parser
  fix). Audit preview over the 77 statements: continuous **2019→2026** coverage, 0
  gaps, 63 reconcile — and it flagged 5 statements where deposit rows were dropped
  (amounts detached onto separate lines by pdftotext reflow; fix pending — derive
  amounts from the balance chain). See ROADMAP "Statement audit page".
- 2026-05-24 — **Cashflow redesign (Fidelity-style).** Rebuilt `/cashflow`:
  income recolored **blue**, net savings **green**; the separate savings /
  debt-paydown rates collapsed into one **Savings rate** (`net/income` — the flow
  taxonomy already nets debt paydown out); **Transfers** now load and show as a
  third breakdown section under Outflows (gross out-leg); removed the page title
  and the bars/lines/net toggle. Layout follows the saved Fidelity reference —
  granularity pills + an **account multi-select** filter, one chart card with a
  Net-savings headline (+ vs-prior-period delta), an inline metric row, recolored
  diverging bars + green net line, and a legend. Data layer now aggregates per
  (month, account, category) so the chart + breakdown re-derive client-side for
  any account selection.
- 2026-05-24 — **Accounts (assets) page polish.** Section / sub-group collapse
  carets moved to the right of the label (fixed the Tailwind-preflight
  `svg{display:block}` wrap); dropped the per-account emoji icons and the row
  sub-line, showing just the last-4 next to the name; the institution logo is now
  a prominent **40px** circle for more color.
- 2026-05-24 — **Paystubs end-to-end + Payroll driven from the DB.** Rewrote the
  paystub parser to be **coordinate-based** (`pdftotext -tsv` word boxes) so it's
  robust across the CBIZ template's content-driven reflow — flat-text anchors had
  failed on most real stubs (grabbed YTD as gross, wrong employer totals, dropped
  line items). It now extracts per-line **earnings / deductions / taxes / employer
  contributions** (each emitted only when it reconciles to the section total),
  non-cash fringe, deposits, and **W-4 tax elections** (filing status, claim
  dependent, allowances); **bonuses** (`BNSNIP`) are recognized. The `paystubs`
  table gained breakdown + `tax_settings` jsonb columns. The **Payroll page now
  loads from the `paystubs` table** (`lib/payroll/load.ts`) instead of hardcoded
  data: dynamic breakdown cards, a Tax elections (W-4) card, an empty state, and a
  derived **event timeline** (raises / bonuses / W-4 changes / ESPP). All-stubs
  table reworked — dedicated **Events** + **Change** columns, compact centered
  layout. `scripts/reprocess-paystubs.ts` re-parses stored PDFs in place after a
  parser fix. Needs a poppler `pdftotext` for `-tsv` (`PDFTOTEXT_BIN` override;
  falls back to totals-only). All 34 real stubs reconcile. Files page also split
  the Type column into **Document type** (editable, from the parser) + **Account
  type**.
- 2026-05-24 — **In-app ingestion pipeline + Upload/Files pages; Settings export +
  Claude key; editable account taxonomy; clean-slate reset.** The Python parser
  moved **into the repo** (`parser/`) and is invoked in-app via
  `lib/parser/extract.ts`; uploads parse and write **straight to Neon** (original
  PDFs stored as `bytea`), surfaced on a new **`/upload`** (drag-drop) + **`/files`**
  (manage, download, reassign account, set type, bulk actions). Account taxonomy is
  now an editable **`account_types`** table with a Settings editor (icons, group
  colors, drag-reorder, Assets/Liabilities parents). **Vendor-map-first
  categorization** (~3,994 rules) applied at ingest; **Claude** (Anthropic API, key
  managed in Settings) fills unknowns via a Review "Categorize with Claude" button.
  **Customizable Excel export** of transactions in Settings. **Transfers split** into
  Transfers In / Transfers Out with a reconciliation page. Category taxonomy
  snapshotted as a **versioned DB default** (`scripts/data/categories.json` +
  `db:seed`); `reset-data.ts` now keeps the taxonomies and clears only ingested +
  account data. **master.xlsx retired as source of truth** — the in-app pipeline is
  primary; xlsx is export-only.
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
