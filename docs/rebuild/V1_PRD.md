# Vault V1 Product Requirements Document

## Status

Draft for collaboration.

This document defines the first production-grade release of Vault. It is intentionally narrower than the prototype and broader than a toy MVP. The goal is to ship a trustworthy, usable personal finance ledger that can eventually replace Monarch Money without trying to recreate every advanced module in the first release.

## Product Summary

Vault V1 is a secure single-user finance ledger for importing, reviewing, categorizing, reporting, and exporting personal financial transactions.

The product should answer four core questions:

1. What happened in my financial life?
2. Can I trust the data?
3. Where did my money go?
4. What is my current financial position?

V1 should be good enough for one real user to rely on for monthly financial review.

## Target Users

### Primary User: Finance Power User

A user currently using Monarch, spreadsheets, bank exports, or a mix of tools. They care about accuracy, reporting depth, custom categorization, and data ownership.

### Secondary User: Future Household Collaborator

A spouse, partner, or trusted household member who may need shared visibility in a later release. V1 should not ship collaboration, but it should avoid architectural choices that make collaboration impossible later.

## V1 Goals

- Create a production-grade foundation for personal finance.
- Support a full monthly workflow: import, review, categorize, report, export.
- Make every important number traceable to transactions.
- Establish strong auth, authorization, and user data isolation.
- Build the system with migrations, tests, CI, and security gates from day one.
- Preserve the prototype's best product insights without inheriting prototype sprawl.

## V1 Non-Goals

V1 will not include:

- Bank sync.
- Native mobile app.
- Household collaboration.
- Invitations and shared roles.
- AI auto-categorization.
- Tax engine.
- Payroll parser.
- Real estate module.
- Investment performance/lots.
- Double-entry accounting.
- General ledger, journal-entry, or trial-balance workflows.
- Bill negotiation.
- Subscription payments.
- Public marketing site.
- Multi-currency beyond storing a currency code.

These are future roadmap items.

## Product Positioning

Vault V1 is not "budgeting for beginners." It is a high-trust financial ledger.

Vault V1 is also not accounting software. It can borrow accounting discipline around audit trails, reconciliations, controls, and source traceability, but the core user-facing record is still a personal-finance transaction.

Compared with Monarch:

- Less automation in V1.
- Better auditability and source traceability.
- More explicit data ownership.
- More flexible long-term architecture.
- Calmer, less prescriptive UX.

Compared with spreadsheets:

- Better workflow.
- Better reporting.
- Safer collaboration.
- Better import provenance.
- Less manual cleanup over time.

## Core User Journey

1. User creates an account.
2. User creates their personal ledger.
3. User creates accounts.
4. User imports transactions from CSV.
5. User previews import results.
6. User commits import.
7. User reviews uncategorized transactions.
8. User creates merchant/category rules.
9. User marks transfers.
10. User views cashflow and net worth.
11. User exports transactions or backup data.

This is the V1 heartbeat.

## Information Architecture

Primary navigation:

- Dashboard
- Transactions
- Review
- Imports
- Cashflow
- Net Worth
- Accounts
- Settings

Deferred navigation:

- Goals
- Forecasting
- Investments
- Documents
- Payroll
- Real Estate
- Tax

## Functional Requirements

### 1. Authentication

Users must be able to:

- Sign up.
- Sign in.
- Sign out.
- Maintain secure sessions across browser restarts.
- Recover access through the selected auth provider's recovery flow.

Requirements:

- Sessions use secure, HttpOnly cookies or equivalent managed-auth best practice.
- Auth endpoints are rate-limited.
- No auth tokens in localStorage.
- Production auth configuration is separate from preview/dev.

Acceptance criteria:

- A signed-out user cannot access app pages or API data.
- A signed-in user can access only their own ledger.
- Auth works in local, preview, and production-like environments.

### 2. Personal Ledger

Users must be able to:

- Create a personal ledger during onboarding.
- View ledger settings.
- Rename ledger.
- Delete ledger only through a strongly confirmed destructive flow.

V1 does not include:

- Invitations.
- Multiple members.
- Roles.
- Account-level permissions.

Acceptance criteria:

- Every financial object belongs to one user-owned ledger.
- A user cannot access another user's ledger by guessing IDs.
- The data model leaves a future path to multi-user households without rewriting the ledger.

### 3. Accounts

Users must be able to:

- Create accounts manually.
- Edit account metadata.
- Close/reopen accounts.
- Archive or hide accounts from active views.
- Add manual balance snapshots.
- View account detail.

Account fields:

- Name.
- Institution.
- Type.
- Asset/liability class.
- Currency.
- Last four or account nickname.
- Opened date.
- Closed date.
- Notes.

V1 account types:

- Checking.
- Savings.
- Credit card.
- Cash.
- Brokerage.
- Retirement.
- Loan.
- Other asset.
- Other liability.

Acceptance criteria:

- Accounts are scoped to a user-owned ledger.
- Closed accounts remain available for historical reports.
- Net-worth reporting can include or exclude closed accounts depending on date context.

### 4. Categories

Users must be able to:

- Use a default category taxonomy.
- Create custom categories.
- Edit category names, colors, icons, and order.
- Archive categories.
- Assign flow type: inflow, outflow, transfer.

V1 category structure:

- Parent category.
- Optional child category.
- Flow type.

Acceptance criteria:

- Category changes do not break historical transactions.
- Archived categories remain visible on existing transactions.
- Reports can group by parent or child category.

### 5. Transactions

Users must be able to:

- View transactions in a table/list.
- Search transactions.
- Filter by date, account, category, merchant, amount range, review state, and transfer state.
- Sort transactions.
- Edit transaction fields.
- Bulk edit category/review/transfer state.
- Soft-delete transactions.
- Restore soft-deleted transactions.

Transaction fields:

- Account.
- Date.
- Posted date.
- Amount.
- Currency.
- Merchant/display name.
- Raw description.
- Category.
- Notes.
- Tags.
- Review status.
- Transfer status.
- Import/source.

Acceptance criteria:

- Every transaction belongs to exactly one user-owned ledger and account.
- Financial writes are audit-logged.
- Transaction edits validate amount/date/category/account ownership server-side.
- Deleted transactions are excluded from default reports but recoverable by authorized users.

### 6. CSV Import

Users must be able to:

- Upload a CSV.
- Map CSV columns to Vault fields.
- Save import mappings per institution/account.
- Preview parsed rows before committing.
- See duplicate warnings.
- Commit valid rows.
- Roll back an import.
- See import history.

Minimum supported CSV fields:

- Date.
- Description.
- Amount, or debit/credit columns.
- Account selection.

Optional CSV fields:

- Posted date.
- Balance.
- Category.
- Notes.

Acceptance criteria:

- Import does not write final transactions until user commits.
- Duplicate detection prevents repeated imports of the same rows.
- Import commit creates an audit event.
- Import rollback soft-deletes or reverses imported rows without affecting unrelated transactions.
- Failed rows are visible with reasons.

### 7. Merchant Normalization and Rules

Users must be able to:

- View normalized merchant names.
- Rename merchant/display name.
- Create a rule that maps merchant pattern to category.
- Apply a rule to future imports.
- Apply a rule to existing unreviewed transactions.
- Disable/delete a rule.

Rule fields:

- Match type: exact, contains, starts with.
- Merchant pattern.
- Category.
- Optional account scope.
- Enabled/disabled.

Acceptance criteria:

- Rule applications are explainable.
- Rule application never overwrites reviewed transactions without explicit confirmation.
- Rule changes are audit-logged.

### 8. Review Queue

Users must be able to:

- Review uncategorized or uncertain transactions.
- See transaction context.
- See similar prior transactions.
- Accept a suggested category if rules provide one.
- Apply category to one transaction.
- Apply category to similar unreviewed transactions.
- Create a rule from a review action.
- Skip.
- Undo recent review actions.

Acceptance criteria:

- User can clean an imported month without leaving the review workflow.
- Batch operations clearly state how many rows will change.
- Undo works for recent review/bulk actions in the same session or through activity history if feasible.

### 9. Transfers

Users must be able to:

- Mark transactions as transfers.
- Pair matching transfer transactions when possible.
- Exclude transfers from income/spending reports by default.
- Include transfers in account ledgers.

Acceptance criteria:

- Transfers remain visible in transactions.
- Cashflow excludes transfer flow by default.
- Transfer state can be edited by authorized users.

### 10. Dashboard

Users must be able to see:

- Net worth snapshot.
- Current month income/spending/net.
- Review queue count.
- Recent imports.
- Account balance summary.
- Top spending categories for current month.

Acceptance criteria:

- Dashboard numbers link to underlying detail pages or filters.
- Empty states guide the user to add accounts/import transactions.

### 11. Cashflow

Users must be able to:

- View income, spending, and net cashflow by month.
- Change date range.
- Filter by account.
- Group by category.
- Drill into transactions.

Acceptance criteria:

- Inflow/outflow/transfer category flow types drive reporting.
- Transfers are excluded by default.
- Refunds and negative income are handled without corrupting totals.

### 12. Net Worth

Users must be able to:

- View assets, liabilities, and net worth over time.
- See account-level composition.
- Use transaction-derived balances where available.
- Use balance snapshots where transaction history is incomplete.
- Drill into account detail.

Acceptance criteria:

- The app distinguishes transaction-derived, imported snapshot, and manual snapshot values.
- Liabilities reduce net worth.
- Credit cards and loans display consistently.

### 13. Export and Backup

Users must be able to:

- Export transactions to CSV.
- Export accounts and categories.
- Export a personal ledger backup package in a documented format, even if restore is basic in V1.

Acceptance criteria:

- Export requires authentication and ledger ownership.
- Export action is audit-logged.
- Export includes enough identifiers to preserve relationships.

### 14. Audit Log

The system must record:

- Account create/edit/close/delete.
- Transaction create/edit/delete/bulk edit.
- Import commit/rollback.
- Rule create/edit/delete/apply.
- Category create/edit/archive.
- Export generation.

Acceptance criteria:

- Audit events include actor, ledger, action, entity, timestamp, and before/after where practical.
- The ledger owner can view activity.

### 15. Demo Mode

Users must be able to:

- Explore the app with synthetic data.
- Reset demo data.

Acceptance criteria:

- Demo data is fully synthetic.
- Demo environment cannot access production data.
- Demo mode is visually marked.

## UX Requirements

### Global UX

- Persistent app shell.
- Fast navigation.
- Responsive layout.
- Light and dark mode support if feasible.
- Accessible keyboard/focus behavior.
- Clear loading, empty, error, and success states.

### Product Tone

- Calm.
- Precise.
- Non-judgmental.
- No guilt language.
- No gamified pressure.

### Financial Data UX

- Money values use tabular numerals.
- Amounts align predictably.
- Inflow/outflow/transfer states are visually distinct.
- Important totals drill down to source transactions.
- Destructive actions explain impact.

## Security Requirements

Security requirements are release blockers.

- All financial data scoped by authenticated user/ledger.
- Server-side authorization on every data path.
- Runtime input validation on every external boundary.
- Rate limiting on auth, import, export, and AI endpoints if AI exists.
- No secrets in client-exposed env vars.
- Separate dev/preview/prod environments.
- Security headers configured.
- Secret scanning in CI.
- Dependency audit reviewed before release.

## Data Requirements

V1 must support:

- User/ledger-scoped financial data.
- Soft deletion for financial records.
- Audit logging for meaningful writes.
- Import provenance.
- Stable IDs.
- Migrations committed to source control.
- Seed/demo data.

V1 should avoid:

- Relying on implicit ownership through nested joins only.
- Destructive hard deletes for ledger records.
- Client-generated trust decisions.
- Floating point for money.

## Reporting Requirements

Every report must define:

- Included transactions.
- Excluded transactions.
- Date basis.
- Transfer behavior.
- Category grouping behavior.
- Account filter behavior.

Reports must be traceable to transaction filters.

## Performance Requirements

Initial targets:

- App shell route transition feels immediate.
- Transaction list handles at least 25,000 transactions for one ledger.
- Search/filter returns within acceptable interactive range.
- CSV import handles 5,000 rows.
- Core reports load within 2 seconds for typical ledger data.

Exact targets should be benchmarked once v1 data model exists.

## Accessibility Requirements

Minimum:

- Keyboard navigation for review and transaction workflows.
- Visible focus states.
- Screen-reader labels for icon-only controls.
- Color contrast meets WCAG AA.
- Status is not communicated by color alone.

## Analytics and Observability

Track product/system health without exposing sensitive data unnecessarily.

Events/metrics:

- Import started/completed/failed.
- Import row counts.
- Review queue count.
- Export generated.
- Error rate.
- Slow queries.
- Auth failures.

Avoid:

- Sending raw transaction descriptions to third-party analytics.
- Tracking sensitive merchant/account details.

## V1 Acceptance Criteria

V1 is releasable when:

- A user can complete the core monthly workflow end to end.
- Cross-user ledger access tests pass.
- Typecheck, lint, tests, build, secret scan, and migration checks pass in CI.
- Production, preview, and development environments are separated.
- Import preview/commit/rollback works.
- Cashflow and net worth are traceable to source data.
- Export works.
- Audit log captures critical actions.
- Demo mode is safe and synthetic.

## Open Product Decisions

1. Auth provider: managed provider or custom passkey-first? **Decision: Clerk managed auth for V1.**
2. CSV-first only for V1, or include PDF document upload without parsing? **Decision: CSV import only for V1. PDF/document upload and parsing deferred.**
3. Should restore from backup be required for V1, or is export enough? **Decision: V1 requires export and documented backup package generation. Full restore is deferred to V1.1.**
4. Should V1 support household invitations, or model households now and ship single-user first? **Decision: single-user V1. Household collaboration deferred.**
5. Money storage: integer minor units vs Postgres numeric? **Decision: integer minor units using `bigint`, plus currency code.**
6. Split transactions: V1 or V1.1? **Decision: defer split transactions to V1.1. V1 uses one category per transaction.**
7. Transaction rules: merchant-only in V1 or richer rule builder? **Decision: V1 supports merchant-to-category rules only, with exact/contains/starts-with matching and optional account scope.**
8. How opinionated should the default category taxonomy be? **Decision: ship an opinionated but editable default taxonomy copied into each personal ledger.**
9. Should the first release be self-hosted, private beta hosted, or local-only? **Decision: private hosted beta on Vercel + Neon Postgres.**
10. Should demo mode be public, private, or only for development? **Decision: synthetic seed/demo data for development, QA, screenshots, and testing. Public demo deferred.**
11. Should the core transaction model be renamed to `ledger_entries`? **Decision: no. V1 uses `transactions`; Vault is not double-entry accounting software.**

## Recommended V1 Scope Decisions

To keep V1 shippable:

- Ship Clerk managed auth. Vault owns ledger ownership and application authorization; Clerk owns identity, login, recovery, and session hardening.
- Ship single-user V1. Use a personal ledger boundary so future household collaboration can be added deliberately later.
- Ship CSV import first.
- Defer PDF/document upload and parsing until after CSV import, review, reporting, export, and audit logging are solid.
- Use integer minor units for money, stored as `bigint` with a currency code. Format for display through centralized helpers.
- Ship merchant/category rules, not a full advanced rule engine. V1 rule matching supports exact, contains, and starts-with merchant matching, optionally scoped to one account.
- Defer split transactions to V1.1. V1 uses one category per transaction; future splits should use child allocation rows that preserve the parent ledger amount.
- Require export and documented backup package generation in V1. Defer full restore/import-from-backup to V1.1.
- Ship an opinionated but editable default category taxonomy. Copy defaults into each personal ledger at creation time; users can rename, create, archive, reorder, and set flow type.
- Target a private hosted beta for V1 on Vercel + Neon Postgres. Local development and preview environments are required; self-hosting and public beta are deferred until after the core workflow is proven.
- Include synthetic seed/demo data for development, QA, screenshots, and testing. Defer public demo mode.
- Keep the core model named `transactions`. Accounting-flavored terminology should support auditability and reconciliation, not turn Vault into general-ledger software.
