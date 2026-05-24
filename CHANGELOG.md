# Vault Changelog

Reverse chronological. The latest thing first.

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
