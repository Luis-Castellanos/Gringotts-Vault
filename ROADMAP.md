# Vault Roadmap

> Last updated: 2026-05-25

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

## Data pipeline (in-app, as of 2026-05-24)

> **Superseded the old model.** The statement parser used to live in a separate
> `bank-statement-extractor` repo emitting `master.xlsx`, which Vault imported.
> That's retired: the parser now lives **inside this repo** and ingestion runs
> **in-app, straight to Neon**. `master.xlsx` is export-only (Settings → Export),
> no longer the source of truth.

**Current architecture:**
1. The parser lives at **`parser/`** (Python). The app invokes it only through
   **`lib/parser/extract.ts`** (spawns `parser/extract.py`; `PYTHON_BIN`
   overridable), which returns one JSON object per PDF — the single swappable
   seam so the parser can later become a TS port or a service.
2. **Upload** (`/upload`, drag-drop) → parse → **`lib/ingest`** writes rows
   straight to Neon. Original PDFs are stored as `bytea` on the `documents` table
   (so everything travels with the DB; self-host needs only a Postgres URL).
   **Files** (`/files`) lists every document — download, reassign account, set
   document-type vs account-type, bulk actions.
3. **Categorization is tiered:** vendor-map rules (`vendor_rules`, ~3,994) apply
   deterministically at ingest; **Claude** (Anthropic API, key managed in
   Settings) fills the unknowns via the Review "Categorize with Claude" button;
   the Review page confirms + teaches the map.
4. The **category taxonomy** and **account-type taxonomy** are first-class,
   editable in-app (Categories page; Settings account-types editor) and stored as
   versioned DB defaults (`scripts/data/categories.json` + `db:seed`).

**Coverage:** bank + credit card (Apple Card, Chase checking/card, Discover, Gain
FCU) and **paystubs** (CBIZ, coordinate-based — see Payroll). Investment (jpm) and
`unknown` are detected but deferred. Loans / mortgage / auto / HSA / 401k remain
future sub-parsers.

**Dependency note:** the paystub parser uses `pdftotext -tsv` (per-word
coordinates), which needs a **poppler** `pdftotext` — the Git-bundled binary is
Xpdf and lacks `-tsv`. `parser/extract.py` resolves a poppler binary
(`PDFTOTEXT_BIN`/`POPPLER_PDFTOTEXT` env → PATH → common locations) and falls back
to a degraded text parse (section totals only, no line items) if none is found.

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
  **2026-05-24:** made view-only — Add Card, field editing, and close/reopen
  removed (account management centralized on /accounts); the card-name pencil
  (nickname rename) stays.
- [x] **Accounts page** — shipped 2026-05-23. Phase A: list + grid views
  (grid default), NW area chart from cumulative transaction history with
  range toggle including custom date range, composition stacked bar, grouped
  sections (Cash / Investments / Liabilities) with sub-groups, credit cards
  aggregated into one row that links to /credit-cards, 12-week per-account
  sparklines, sort dropdown, per-subgroup drag-to-reorder, Monarch-style
  2-step Add Account flow (category picker → form), asset detail modal
  (editable name/institution/last4/opened with same validation), Show/Hide
  closed accounts toggle, Mark-as-closed + Re-open on both views.
  **2026-05-24:** restructured — this reporting view moved to /net-worth
  (read-only) and /accounts became a settings page (collapsible sections,
  institution logos, click-to-expand per-account detail with inline edit, add,
  delete, and merge). Per-type fields now real: APY (cash/savings), interest
  rate / monthly payment / original principal / maturity (loans), subtype
  (brokerage/retirement). Brokerage gain%/holdings still need a holdings model.
- [x] **Payroll page** — shipped 2026-05-23, **marked complete 2026-05-24** (moved
  to Complete in the sidebar; the page/UX is done — paystub data swaps in when the
  extractor supports it, per the note below). Three tabs: Single stub
  (hero + interactive donut + Earnings / Deductions / Taxes / Employer cards
  + Imputed footnote, prev/next nav), All stubs (table with year filter and
  event chips), YTD summary (year picker, big hero, 4 colored metric cards,
  monthly stacked bar chart with event dots + hover tooltip, Saved+Invested,
  Year events timeline, full tax breakdown). **2026-05-24: now DB-backed** —
  reads the `paystubs` table via `lib/payroll/load.ts` (no more hardcoded data;
  empty table → empty state). The CBIZ paystub parser is coordinate-based
  (`pdftotext -tsv`) and extracts per-line **earnings / deductions / taxes /
  employer contributions** (emitted only when they reconcile to the section
  total), **non-cash fringe**, **deposits**, and **W-4 tax elections** (filing
  status, claim dependent, allowances); **bonuses** are recognized. The page
  renders dynamic breakdown cards, a Tax elections (W-4) card, and a derived
  **event timeline** (raises / bonuses / W-4 changes / ESPP). All-stubs table has
  dedicated Events + Change columns. Validated against 34 real stubs (all
  reconcile). Future employers' layouts/label-codes may need parser tweaks.

#### Data layer (prerequisites for the reporting pages)

> **2026-05-24: pipeline moved in-app** (see "Data pipeline" above). `master.xlsx`
> and `load-master.ts` are retired as the import path; uploads parse + ingest
> straight to Neon via `/upload` + `lib/ingest`, surfaced on `/files`. New this
> pass: editable `account_types` taxonomy + Settings editor, vendor-map +
> Claude categorization, customizable Excel **export**, Transfers In/Out split +
> reconciliation page, and a versioned category-taxonomy DB default. The bullets
> below describe the older master.xlsx era and are kept for history.

- [x] **Parser-to-Vault data pipeline** — overhauled 2026-05-23 for the new
  master.xlsx schema. `load-master.ts` now (1) syncs the full taxonomy from the
  `Categories` sheet (Type → flow_type, Category → parent, Sub-category → child,
  with Type-prefixed slugs so repeats like Zelle/Check/Other stay unique), and
  (2) reads the per-row `Type` column for flow_type / isTransfer. One clean reset
  + re-import loaded all **9,746 transactions** (0 unmatched, 0 needing review),
  fixing the old sign issues. Monthly rhythm = re-run `db:load-master`. Read-only
  audit helpers added: `inspect-master`, `inspect-taxonomy`, `check-mapping`.
  - [x] **Account-identity reconciliation** (2026-05-24) — `getOrCreateAccount`
    now attaches to a unique last-4 match so imports stop spawning duplicate
    label-accounts, and the /accounts settings page has a merge tool to fold the
    existing dupes into their curated accounts (a user action on the page).
  - [x] Per-type account fields added 2026-05-24 (APY, loan terms, subtype);
    brokerage gain% / holdings still need a holdings model.
- [x] **Flow-type taxonomy on categories** — done 2026-05-23. `flow_type` enum
  (inflow/outflow/transfer) added to categories and populated directly from the
  master file's `Type` column on every import. Powers Cashflow.

#### Pages still to design (Claude.ai artifacts first, then code)

> All of these now have live **under-development placeholder routes** (shared
> `UnderDevelopment` component) so the nav is never dead-ended. Transactions
> shipped a real Phase A directly (below); the rest still need a design pass.

- [x] **Transactions** — shipped 2026-05-23 (Phase A), **completed 2026-05-24**.
  Date-grouped list + multi-tab Filters modal, search, sort, inline expand-to-edit.
  2026-05-24 buildout (now considered complete): server-side filtering/search/sort
  with the full matching set preloaded and rendered incrementally (no network
  "load more"); bulk multi-select actions (categorize / mark reviewed / transfer)
  via POST /api/transactions/bulk; saved filter views (localStorage); list + table
  views with a density toggle; sticky toolbar; collapsible day groups with
  select-whole-day; per-account detail page (/accounts/[id]: balance-over-time
  chart + summary sidebar + account-scoped list); and a redesigned expand-to-edit
  (merchant, two-level Category/Sub-category icon pickers, editable date,
  original-statement + copy, view-all-from-merchant, delete). Vendor logos now use
  Google's favicon service (Clearbit's free logo API was discontinued) keyed off a
  curated vendor→domain map (`lib/vendor-domain.ts`); unrecognized merchants show
  colored initials.
  - _Future option:_ wire **logo.dev** (publishable `NEXT_PUBLIC_` token) for
    full-fidelity brand wordmark logos instead of favicons. ~15 min, low effort;
    gate on the env var with favicon fallback. Deferred 2026-05-24.
- [x] **Dashboard** — first pass shipped 2026-05-25. The default landing page (`/`):
  net-worth headline + 30-day delta + SVG area sparkline, this-month cashflow
  tiles (income / spending / net + savings rate), top spending categories (with
  bars), grouped account snapshot (Cash / Investments / Liabilities → account
  detail), and quick links (Review w/ count, Transactions). `lib/dashboard/load.ts`
  batches all queries. _Future:_ tailored skeleton, date-range control, more cards.
- [x] **Cashflow** — shipped 2026-05-23 (Phase A). Income-vs-spending chart
  (income/expense bars + net-line overlay) with Monthly / Quarterly / Yearly
  toggle, click/prev-next period selection + hover tooltip, selected-period
  summary tiles (Income / Expenses / Net Savings / Savings Rate), and Income +
  Expenses breakdown lists with a Category / Group toggle and proportional bars.
  Adapted from Monarch's Cash Flow design into Vault's palette. **2026-05-24:**
  date-range presets + ‹ › paging (reaches all history back to 2019), and the
  breakdown redesigned as full-row tinted bars. Still TODO: Merchant breakdown
  dimension, account filters, YoY comparison, more reporting views.
- [x] **Net Worth** — shipped 2026-05-24. The former Accounts reporting view
  (NW area chart, composition bar, grouped Cash/Investments/Liabilities balances
  + sparklines), now read-only at /net-worth. Deeper multi-year / account-level
  drill-down still to design.

### Phase 3: Anywhere

Make Vault accessible from any device, with reasonable security. Polish the experience.

- [ ] Auth (passwordless / passkey-based, single user)
- [ ] Deploy to Vercel
- [ ] Mobile responsive review screen
- [ ] Mobile responsive dashboard
- [ ] Read-on-phone, edit-on-desktop optimization
- [ ] **PWA support** — manifest, service worker, installable to iOS home screen
- [ ] **Mobile-first review experience** — the iPhone-sized review queue, optimized for thumbs not mice
- [x] **Performance pass — page responsiveness** — diagnosed 2026-05-24,
  **shipped 2026-05-25**. Navigation used to freeze the whole view (every page was
  `force-dynamic`, rendered its own `<Sidebar/>`, and fetched serially with no
  loading UI). Done:
  - [x] **App-shell layout** — `TopBar` + `Sidebar` + the centering wrapper now
    live in `app/layout.tsx`, so navigation swaps only the content and the rails
    stay mounted. All 19 pages dropped their wrapper and return just their
    `<main>`. (`reviewCount` was never threaded, so the Sidebar is a pure client
    component — nothing to lift but the markup.)
  - [x] **`loading.tsx` skeletons** — 11 routes show an instant content
    placeholder while server data loads (sidebar stays put). Tailored for
    Transactions / Net Worth / Cashflow; generic (`components/Skeleton.tsx`) for
    the lighter data pages; the 8 static pages render instantly and get none.
    Theme-aware `.skeleton` shimmer added to `globals.css`.
  - [x] **Parallelize per-page queries** with `Promise.all` — Transactions 5→1,
    Credit Cards 4→1, Net Worth / Accounts 3→1, Settings 6→1, Categories 2→1,
    Files 3-of-4, Account detail folded in. Cashflow / Payroll / Transfers were
    already single-query.
  - [ ] _Still open:_ general query optimization + `revalidate`/caching for
    semi-static data. (Separate Phase 4a "Faster upload/ingest" work is still
    pending too.)

### Phase 4a: Import polish

Make the manual import workflow fast enough that monthly maintenance is a 5-minute task,
not a 1-hour ordeal.

- [ ] Better merchant cleaner (handle international addresses, more processor prefixes)
- [ ] **Statement audit page** (Valid8-style) — accounts × statements on a
  timeline, green = fully loaded / yellow = coverage gap, with per-statement
  total inflows/outflows, transaction count, and a **stated-vs-derived balance
  reconciliation** (begin → end, with the exact row where the running-balance
  chain breaks). Audit one suspect statement or all at once.
  - [x] **Data capture (2026-05-24)** — parser now extracts statement **audit
    control totals** (`extract_statement_summary`: period start/end, stated
    beginning/ending balance, stated deposit/withdrawal totals) + per-row running
    balance. Stored on `imports` (control totals) and `transactions.balance`.
    Chase Checking done; Gain FCU partial; credit cards emit null until samples
    arrive (different recon model — see parser/references/bank_formats.md). The
    page itself is still to build.
  - [x] **Balance-chain parsing (2026-05-24)** — `parse_chase_checking` now
    derives each amount from the printed running balance (`amount[i] =
    balance[i] - balance[i-1]`), bounded by Chase's `*start*/*end*transaction
    detail` markers, so pdftotext-reflowed deposit rows (amount detached onto its
    own line) are recovered instead of dropped. Validated on 77 real Chase
    statements: **71 reconcile** (was 63), 0 blank balances, 0 coverage gaps.
  - [ ] **Known reconciliation residuals — troubleshoot later** (6 statements;
    small, pre-existing, and *unchanged* by the balance-chain rewrite, so NOT the
    detached-deposit bug). Re-surface with `scripts/audit-preview.ts`; inspect raw
    text with `scripts/dump-doc-text.ts`:
    - `12/10/2024` — −$0.06 (rounding; benign).
    - `05/09/2025` — deposits & withdrawals each −$160 but they cancel, so the
      balance still reconciles (a classification/split quirk; no lost money).
    - `02/2021` (−$284), `03/2021` (−$100), `07/2021` (−$15), `06/2024` (−$86) —
      small end-balance gaps. The derived end isn't even a printed balance, so a
      withdrawal is recorded somewhere the detail's running-balance chain doesn't
      cleanly carry. Fix = trace each statement's chain to the off-detail row.
- [ ] Duplicate detection improvements
- [ ] Import dry-run / preview before committing
- [ ] Re-clean script as a UI button, not a CLI command
- [x] **Faster upload/ingest** — diagnosed 2026-05-24, **shipped 2026-05-25**.
  The upload route was strictly sequential (store → parse → ingest, one file at a
  time). Now two-phase:
  - [x] **Parse in parallel** (bounded pool, `PARSE_CONCURRENCY`, default 6) — the
    per-file Python + `pdftotext` spawn is the bottleneck and is independent per
    file (`runExtractor` uses a unique `mkdtemp` dir per call, so it's race-safe).
  - [x] **Ingest serial** — a second pass does all ledger writes one at a time, so
    `getOrCreateAccount`'s check-then-insert can't race into duplicate accounts.
    (Transaction writes were already dedup-safe via the unique `content_hash`
    index.) In-batch byte-identical dupes still report `duplicate`.
  - [x] **Load the vendor map once per batch** — `loadIngestMaps()` loads the ~4k
    `vendor_rules` (+ category maps) once and threads them into every file's
    ingest, instead of reloading per file.
  - Measured **~5x faster parse** on real stored statements
    (`scripts/bench-parse.ts`): 80 files 7.4s → 1.4s. The optional
    "one Python invocation for the whole batch" wasn't needed — parallelism alone
    cleared it.

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

- [x] **Real Estate** — **first pass 2026-05-25, then built out to full Stessa
  parity the same day.** New `properties` table (address / specs / acquisition /
  market value / land-value % / optional `mortgage_account_id` / escrow account).
  `/rentals` is a large-card portfolio (value · loan · equity + equity bar) with
  portfolio tiles, add/edit modal, **photo upload** (stored as `bytea`),
  **drag-to-reorder**, sort, and sold-lifecycle. `/rentals/[id]` shows the property
  header, metric cards, and a **mortgage amortization table** (yearly⇄monthly,
  payoff progress) from `lib/properties/amortization.ts`. **Shipped this round
  (Phases 1–6):** per-property financials + attribution (account rollup + manual
  tag), **return metrics** (cap rate / cash-on-cash / NOI / DSCR / ROI), **rent
  roll** (`leases`), **maintenance** work-order log (`maintenance`), **Schedule E**
  worksheet + Excel export (`lib/properties/schedule-e.ts`), and **capex +
  straight-line depreciation** (`capex` table, 27.5-yr; feeds Schedule E line 18).
  Mortgage-payment **split** into principal/interest/escrow via the
  `transaction_splits` side-table (balances untouched). API: `/api/properties`,
  `/api/leases`, `/api/maintenance`, `/api/capex`, `/api/export/schedule-e`. See
  `docs/real-estate-expansion-plan.md` (all 6 phases marked shipped).

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
- [~] **Investment analysis** — **first pass shipped 2026-05-25** (`/investments`,
  moved to "Under development"): total portfolio value + value-over-time area
  chart (Fidelity-style) from transaction history, per-account balances with
  sparklines, and allocation-by-account. `lib/investments/load.ts`. **Market-data
  seam wired 2026-05-25** — `lib/market/quotes.ts` (Twelve Data adapter; key
  managed in **Settings → Market data** or `MARKET_DATA_KEY`, with a Test-connection
  probe), and a live **S&P 500 (SPY)** quote on the Investments hero. _Still gated
  on a holdings/cost-basis model_ (the **jpm investment sub-parser** must emit
  holdings) for asset-class allocation, performance attribution, fees,
  contributions-vs-growth, per-holding detail, and a true benchmark performance
  overlay. NOTE: the existing value-over-time series is cumulative net cash flow,
  **not** market value — don't overlay a benchmark %-growth line on it.
- [ ] Subscription tracker (auto-detect recurring charges, surface upcoming renewals)
- [x] **Goals** — **shipped 2026-05-25, full Monarch parity** (`/goals`). Save-up
  goals (target / date / monthly contribution / **growth rate**; assign asset
  accounts with **per-account allocation** — whole balance or fixed amount;
  on-track/at-risk status + projected date + required-monthly) and pay-down goals
  (assign debt accounts → payoff projection). **Debt-payoff scenarios**
  (`lib/goals/payoff-scenario.ts`): avalanche/snowball + extra-monthly + lump-sum
  what-ifs → debt-free date, interest saved vs minimums, per-debt order.
  Priority **drag-to-reorder**. Schema: `goals` / `goal_accounts`. Subsumes the old
  "net worth goals" idea. _Possible follow-up:_ a global available-vs-allocated
  overview.
- [ ] **Move Categories taxonomy and Vendors list into Vault.** Today they live
  in master.xlsx because iterating in Excel is fast. Eventually they belong in
  Vault so categorization can be a first-class in-app concept.
  - [x] **Categories management page** — shipped 2026-05-24 at `/categories`.
    View the full taxonomy grouped by flow type (parent → child tree with
    transaction counts); add / rename / remove categories + subcategories; and
    merge (reassign all of a category's transactions into another, isTransfer
    following the target, with optional delete-after). API: POST /api/categories,
    PATCH + DELETE /api/categories/[id], POST /api/categories/[id]/reassign.
  - ⚠️ **Source-of-truth tension:** `load-master.ts` still upserts the taxonomy
    from master.xlsx's Categories sheet on every import, so in-Vault edits to
    master-defined categories (renames, deletes) get overwritten on the next
    import. Resolve by either making the loader insert-only for existing
    categories, or promoting Vault to the taxonomy source of truth. Vendors list
    still lives in Excel.
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
