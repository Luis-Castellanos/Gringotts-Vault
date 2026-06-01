# Vault V1 Build Plan

## Status

Draft for collaboration. Active implementation work is paused for UI cleanup and design-system consolidation.

This document turns the V1 PRD and V1 data model into an execution plan for a new production-grade repo.

## Build Strategy

Current priority: stop expanding feature scope and stabilize the interface layer first. Resume feature milestones only after the UI cleanup track has locked shared primitives, layout rhythm, color roles, and typography.

V1 should be built as a sequence of thin, verified vertical slices. Each milestone should leave the app more usable and more trustworthy.

Do not start by recreating the prototype screen-for-screen. Start with the system spine:

1. Repo quality gates.
2. Managed auth.
3. Personal ledger ownership boundary.
4. Database schema and migrations.
5. Core ledger CRUD.
6. CSV import preview/commit.
7. Review and rules.
8. Reports.
9. Export and private beta hardening.

## Guiding Rules

- Main branch must always build.
- No production `db:push`; migrations only.
- No feature ships without authorization tests.
- No financial write ships without audit logging.
- No import writes final transactions before preview.
- No public demo in V1.
- No double-entry/general-ledger concepts.
- Keep UI useful and restrained; avoid prototype sprawl.
- During the UI cleanup track, do not start new feature slices; fix shared layout, component, color, and typography issues first.

## Recommended New Repo Setup

Create a new production repo rather than continuing in the prototype repo.

Suggested name options:

- `vault`
- `vault-ledger`
- `gringotts-vault-v2`
- `vault-finance`

Prototype repo remains the reference library.

## Suggested Stack

Application:

- Next.js App Router.
- React.
- TypeScript strict mode.
- Tailwind CSS.

Database:

- Postgres.
- Drizzle ORM.
- Committed SQL migrations.
- Neon Postgres for private beta hosting.

Auth:

- Clerk managed auth.
- Vault-owned `users` and `ledgers` tables.

Testing:

- Vitest for unit and integration tests.
- React Testing Library for component behavior tests.
- Playwright for E2E tests.
- Test database for migration/data-access checks.

CI:

- Install with lockfile.
- Typecheck.
- Lint.
- Unit tests.
- Integration tests.
- Build.
- Secret scan.
- Migration check.

Deployment:

- Vercel app hosting.
- Neon Postgres database.
- Separate local, preview, and production databases/environments.

## Milestone 0: Project Scaffold and Quality Gates

Goal: Create a production repo that cannot silently decay.

Scope:

- Initialize Next.js app.
- Configure TypeScript strict mode.
- Configure formatter/linter.
- Configure test runner.
- Configure CI.
- Configure environment examples.
- Add base app shell.
- Add docs folder with copied rebuild docs.
- Add secret scanning.

Deliverables:

- Running local app.
- Passing CI.
- `README.md` with local setup.
- `.env.example` with placeholders only.
- Initial deployment target or preview environment.

Acceptance criteria:

- `typecheck`, `lint`, `test`, and `build` pass locally and in CI.
- Main branch is deployable.
- No secrets committed.
- Project has a clear local setup path.

Suggested tasks:

1. Create repo.
2. Add app scaffold.
3. Add lint/format/test tooling.
4. Add CI workflow.
5. Add basic app shell.
6. Add rebuild docs.

## Milestone 1: Auth and Personal Ledger

Goal: Establish identity and the V1 ownership boundary.

Scope:

- Clerk integration.
- `users` table.
- `ledgers` table.
- Onboarding flow to create first ledger.
- Server-side current-user/current-ledger helper.
- Protected routes.
- Basic settings page for ledger name.

Deliverables:

- Sign up/sign in/sign out.
- Personal ledger creation.
- Protected app shell.
- User cannot access without auth.

Acceptance criteria:

- Signed-out requests cannot access app data.
- Authenticated user can create and view their ledger.
- User cannot access another user's ledger by ID in tests.
- `ledger_id` is always derived server-side.

Tests:

- Auth guard test.
- Current ledger helper test.
- Cross-user ledger access denial.

## Milestone 2: Database Foundation and Seed Data

Goal: Implement the V1 schema and seed defaults.

Scope:

- Core migrations:
  - `users`
  - `ledgers`
  - `institutions`
  - `accounts`
  - `categories`
  - `merchants`
  - `merchant_rules`
  - `imports`
  - `import_rows`
  - `transactions`
  - `balance_snapshots`
  - `saved_import_mappings`
  - `export_jobs`
  - `audit_events`
- Default category seed.
- Synthetic demo ledger seed.
- Money formatting/parsing helpers.

Deliverables:

- Database can be migrated from empty.
- New ledger gets default categories.
- Demo seed creates realistic synthetic data.

Acceptance criteria:

- Migration from empty database succeeds.
- Seed scripts are idempotent.
- Money helpers round-trip integer minor units correctly.
- Category hierarchy is limited to two levels.

Tests:

- Migration smoke test.
- Category seed idempotency.
- Money helper unit tests.
- Category depth validation.

## Milestone 3: Accounts

Goal: Let the user define financial accounts.

Scope:

- Accounts page.
- Create/edit/close/reopen accounts.
- Institution creation/selection.
- Manual balance snapshot entry.
- Account detail page.
- Audit log for meaningful account changes.

Deliverables:

- User can create accounts needed for imports and reports.
- Account list and detail pages are usable.

Acceptance criteria:

- Account belongs to current ledger.
- User cannot create account under another ledger.
- Account close date cannot precede open date.
- Account deletion is soft-delete unless no related records exist.
- Manual balance snapshots are visible in account detail.

Tests:

- Account CRUD authorization.
- Account validation.
- Balance snapshot validation.
- Audit event creation.

## Milestone 4: Transactions Manual CRUD

Goal: Create the core transaction ledger before imports.

Scope:

- Transactions table/list.
- Manual transaction create/edit/delete/restore.
- Search and filters.
- Category assignment.
- Merchant normalization on create/edit.
- Transfer marking.
- Audit log for writes.

Deliverables:

- User can manually enter and manage transactions.
- Transaction list becomes the core work surface.

Acceptance criteria:

- Transactions use signed `amount_minor`.
- Each transaction belongs to one ledger and account.
- Soft-deleted transactions are excluded by default.
- Transfer transactions remain in ledger but are excluded from cashflow later.
- Edits are audit-logged.

Tests:

- Transaction CRUD authorization.
- Money validation.
- Merchant normalization.
- Soft delete/restore.
- Transfer state validation.

## Milestone 5: CSV Import Preview

Goal: Parse CSV files safely without committing transactions yet.

Scope:

- CSV upload form.
- Column mapping UI.
- Saved import mappings.
- Parse rows into `imports` and `import_rows`.
- Validate dates, descriptions, amount/debit/credit.
- Generate dedupe keys.
- Show preview with valid/duplicate/invalid rows.

Deliverables:

- User can upload a CSV and inspect parsed rows before commit.

Acceptance criteria:

- No final transactions are created during preview.
- Invalid rows show specific error messages.
- Duplicate rows are visible, not silently dropped.
- Import mapping can be saved and reused.
- File size/type validation exists.

Tests:

- CSV parser fixtures.
- Debit/credit column parsing.
- Amount sign parsing.
- Duplicate detection.
- Import ownership authorization.

## Milestone 6: CSV Import Commit and Rollback

Goal: Turn previewed rows into ledger transactions safely.

Scope:

- Commit valid import rows.
- Apply merchant normalization.
- Apply enabled merchant rules.
- Create transactions.
- Link transactions to import/import rows.
- Import rollback.
- Import history page.
- Audit events.

Deliverables:

- Full CSV import lifecycle: preview, commit, rollback.

Acceptance criteria:

- Commit is transactional.
- Import rollback affects only transactions created by that import.
- Reviewed transactions are not overwritten by rules.
- Import history shows status and row counts.
- Import commit and rollback are audit-logged.

Tests:

- Commit transactionality.
- Rollback scope.
- Merchant rule application.
- Reviewed transaction protection.
- Audit events.

## Milestone 7: Categories, Merchants, and Rules

Goal: Make cleanup faster over time.

Scope:

- Category management.
- Merchant management.
- Merchant-to-category rule CRUD.
- Rule application to future imports.
- Rule application to existing unreviewed transactions.
- Exact/contains/starts-with matching.
- Optional account scope.

Deliverables:

- User can customize categories and automate repeat categorization.

Acceptance criteria:

- Category depth limited to parent/child.
- Archived categories remain valid on existing transactions.
- Rules cannot target another ledger's account/category.
- Bulk rule application states row count before applying.
- Rule writes and bulk applications are audit-logged.

Tests:

- Category validation.
- Rule matching.
- Account-scoped rules.
- Cross-ledger rule rejection.
- Bulk rule application.

## Milestone 8: Review Queue

Goal: Make monthly cleanup fast and confident.

Scope:

- Review queue page.
- One-at-a-time review.
- Batch review.
- Similar prior transactions.
- Suggested category from rules/history.
- Apply to one.
- Apply to similar unreviewed.
- Create rule from action.
- Skip.
- Undo recent action if feasible.

Deliverables:

- User can clear uncategorized/unreviewed transactions without living in the full table.

Acceptance criteria:

- Review flow shows enough context to decide quickly.
- Batch action clearly states affected count.
- Reviewed transactions are protected from accidental bulk overwrites.
- Review actions are audit-logged.

Tests:

- Review queue query.
- Similar transaction matching.
- Apply-one vs apply-many.
- Rule creation from review.
- Undo or audit-backed reversal path.

## Milestone 9: Core Reports

Goal: Deliver the first real payoff.

Scope:

- Dashboard.
- Cashflow.
- Net Worth.
- Account detail reporting.
- Report drill-down to transaction filters.

Deliverables:

- User can answer what happened, where money went, and current position.

Acceptance criteria:

- Cashflow excludes transfers by default.
- Cashflow respects category `flow_type`.
- Net worth handles assets and liabilities.
- Net worth labels transaction-derived vs snapshot-derived balances.
- Report totals drill into transaction filters.
- Reports work with synthetic demo data and imported data.

Tests:

- Cashflow calculation fixtures.
- Transfer exclusion.
- Refund/negative income handling.
- Net-worth calculation fixtures.
- Drill-down filter consistency.

## Milestone 10: Export and Backup Package

Goal: Make data portable and auditable.

Scope:

- `export_jobs`.
- Transactions CSV export.
- Backup package generation.
- Export history.
- Audit event for exports.
- Document backup package format.

Deliverables:

- User can export transactions and a structured backup package.

Acceptance criteria:

- Every export creates an `export_jobs` record.
- Small exports may complete synchronously.
- Export requires auth and ledger ownership.
- Backup package includes audit events by default.
- Export does not leak another ledger's data.

Tests:

- Export authorization.
- Backup manifest counts.
- CSV column consistency.
- Audit event creation.

## Milestone 11: Private Hosted Beta Hardening

Goal: Make the app safe enough for real private use.

Scope:

- Production deployment.
- Preview deployment.
- Environment separation.
- Database backups.
- Security headers.
- Rate limits for auth/import/export.
- Error handling.
- Observability/logging.
- Dependency audit review.
- Secret scanning.
- E2E core monthly workflow test.

Deliverables:

- Private hosted beta.

Acceptance criteria:

- Production, preview, and local environments are isolated.
- No preview deployment touches production data.
- Backups are enabled and tested.
- Secret scan passes.
- Dependency audit has no unresolved high/critical issues.
- Core monthly workflow E2E passes.

Tests:

- E2E: sign in, create ledger, create account, import CSV, review, report, export.
- Security regression tests.
- Deployment smoke test.

## Suggested Issue Epics

1. Project foundation.
2. Auth and ledger.
3. Database and seed data.
4. Accounts.
5. Transactions.
6. CSV import.
7. Categories and rules.
8. Review queue.
9. Reports.
10. Export.
11. Private beta hardening.

## CI Gate Checklist

Every PR:

- Typecheck passes.
- Lint passes.
- Unit tests pass.
- Integration tests pass where relevant.
- Build passes.
- Migrations apply from empty database.
- No secrets detected.

Financial-write PRs:

- Authorization tests.
- Runtime validation.
- Audit logging.
- Cross-ledger rejection tests.

Import/report PRs:

- Fixture tests.
- Edge-case tests.
- Traceability to source rows or transaction filters.

## Manual QA Checklist for V1

Core monthly workflow:

1. Sign in.
2. Create personal ledger.
3. Create checking account.
4. Create credit card account.
5. Import checking CSV.
6. Import credit card CSV.
7. Review uncategorized transactions.
8. Create merchant rules.
9. Mark transfers.
10. View cashflow.
11. View net worth.
12. Export transactions.
13. Export backup package.
14. Roll back an import.
15. Confirm reports update correctly.

## Documentation To Keep Updated

- `README.md` setup.
- `.env.example`.
- Migration guide.
- Backup package format.
- CSV import format guide.
- Security checklist.
- Release checklist.
- Changelog.

## Recommended Next Step

Before code:

1. Choose the new repo name.
2. Auth provider: Clerk.
3. ORM: Drizzle.
4. Deployment target: Vercel + Neon Postgres.
5. Test stack: Vitest + React Testing Library + Playwright.

Then scaffold Milestone 0.
