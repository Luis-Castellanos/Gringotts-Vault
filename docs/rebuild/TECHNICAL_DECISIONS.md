# Vault Technical Decisions

## Status

Draft decision log for the V1 rebuild.

This document records decisions that should guide the production scaffold and prevent repeated re-litigation. If a decision changes later, add a new entry with context instead of silently editing history.

## Decision Summary

| Area | Decision |
|------|----------|
| Product name | TBD |
| V1 release target | Private hosted beta |
| Hosting | Vercel |
| Database | Neon Postgres |
| Auth | Clerk |
| ORM | Drizzle |
| Testing | Vitest + React Testing Library + Playwright |
| Ownership boundary | Personal ledger |
| Ownership table | `ledgers` |
| Ownership FK | `ledger_id` |
| Core activity table | `transactions` |
| Money storage | `bigint` minor units + currency code |
| Import scope | CSV only |
| Document/PDF upload | Deferred |
| Split transactions | Deferred to V1.1 |
| Category depth | Two levels: parent + child |
| Rules | Merchant-to-category rules only |
| Backup | Export package in V1; restore deferred |
| Audit events in backup | Included by default |
| Demo data | Synthetic internal/dev/QA data; no public demo |
| Double-entry accounting | Explicit non-goal |

## ADR 001: Treat Prototype as Reference, Not Production Base

Status: Accepted.

Context:

The existing Gringotts Vault prototype explored a large feature surface: transactions, imports, payroll, tax, real estate, reports, passkeys, and more. It proved many product ideas, but it also carries prototype sprawl, stale docs, missing tests, missing migrations, and build/lint issues.

Decision:

Build V1 in a new production repo. Keep the prototype as a research/reference library.

Consequences:

- V1 can start with clean migrations, CI, tests, and security posture.
- Useful prototype ideas can be ported deliberately.
- Some code may be rewritten instead of reused.

## ADR 002: Single-User V1 With Personal Ledger Boundary

Status: Accepted.

Context:

Multi-user households are desirable long-term, but V1 should focus on a reliable single-user monthly finance workflow.

Decision:

V1 is single-user. Every financial object belongs to a personal `ledger`. The ownership boundary is `ledger_id`.

Consequences:

- V1 avoids invitation/member/role complexity.
- Cross-user data isolation remains testable.
- Future household collaboration can add `ledger_members` without rewriting every financial table.

## ADR 003: Use Accounting-Inspired Language Without Becoming Accounting Software

Status: Accepted.

Context:

The product should appeal to a finance/forensic-accounting mindset, but it is not general-ledger software.

Decision:

Use product language like ledger, audit trail, source traceability, controls, and reconciliation. Keep the core activity model named `transactions`. Do not introduce double-entry, journal entries, trial balances, debits/credits, or chart-of-accounts concepts in V1.

Consequences:

- The app feels rigorous without becoming accounting software.
- Users keep familiar personal-finance concepts.
- V1 avoids double-entry complexity.

## ADR 004: Use Clerk for Managed Auth

Status: Accepted.

Context:

Auth is security-critical and not Vault's product differentiator. V1 needs a private hosted beta quickly and safely.

Decision:

Use Clerk for managed authentication. Vault stores local `users` keyed by Clerk user ID and owns ledger authorization in application/database code.

Consequences:

- Faster auth implementation.
- Less custom session/recovery/security surface.
- Clerk is a dependency and potential vendor lock-in.
- Vault must keep a clean boundary: Clerk authenticates, Vault authorizes ledger access.

## ADR 005: Use Drizzle ORM

Status: Accepted.

Context:

Vault is database-centered: imports, transactions, reports, audit events, dedupe, and traceability. The prototype already used Drizzle.

Decision:

Use Drizzle ORM with Postgres and committed migrations.

Consequences:

- Schema and queries stay close to SQL.
- Better fit for reporting-heavy finance logic.
- More manual than Prisma.
- Requires strong migration discipline.

## ADR 006: Use Vercel + Neon Postgres for Private Beta

Status: Accepted.

Context:

V1 targets a private hosted beta, not local-only, self-hosted-first, or public beta.

Decision:

Deploy the app on Vercel and use Neon Postgres for the database.

Consequences:

- Natural fit for Next.js.
- Good Postgres/serverless compatibility.
- Separate local, preview, and production environments are required.
- Self-hosting remains deferred.

## ADR 007: Use Vitest, React Testing Library, and Playwright

Status: Accepted.

Context:

Vault needs tests at different levels: financial logic, data access, UI states, and full user workflows.

Decision:

Use:

- Vitest for unit and integration tests.
- React Testing Library for component behavior.
- Playwright for E2E browser flows.
- Dedicated test database for migration/data-access checks.

Consequences:

- Good coverage of financial correctness and UI behavior.
- E2E can validate the monthly workflow.
- CI setup is more involved but worthwhile.

## ADR 008: Store Money as Integer Minor Units

Status: Accepted.

Context:

Financial math must avoid floating-point errors.

Decision:

Store money as `bigint` minor units plus a currency code. For USD, `$12.34` is stored as `1234`.

Consequences:

- Accurate arithmetic and comparisons.
- Display formatting must convert minor units to currency strings.
- Multi-currency is not a V1 product goal, but currency code exists for future flexibility.

## ADR 009: CSV-First Imports

Status: Accepted.

Context:

Statement/PDF parsing is a major future differentiator, but it adds file security, parser reliability, background jobs, and institution-specific complexity.

Decision:

V1 supports CSV import only. PDF/document upload and parsing are deferred.

Consequences:

- V1 can focus on ledger correctness, preview/commit/rollback, review, reporting, and export.
- Statement-first philosophy remains a future expansion.

## ADR 010: Stage Imports Before Commit

Status: Accepted.

Context:

Imports can mutate many financial records at once. Silent corruption would destroy trust.

Decision:

CSV imports create `imports` and `import_rows` first. Final `transactions` are created only when the user commits valid rows.

Consequences:

- Import preview is mandatory.
- Duplicate/invalid rows can be inspected.
- Rollback is scoped to committed import rows.

## ADR 011: Use Two-Level Categories

Status: Accepted.

Context:

Deep category trees make personal finance review and reporting harder.

Decision:

V1 supports two product levels: parent category and child category. The schema uses `parent_id`, but services/UI prevent deeper nesting.

Consequences:

- Reporting remains legible.
- Review UI stays manageable.
- Future depth can be added only if a real need emerges.

## ADR 012: Keep Rules Simple

Status: Accepted.

Context:

Rules are important for cleanup, but a full rules engine would expand V1 scope too much.

Decision:

V1 supports merchant-to-category rules only, with match types:

- exact
- contains
- starts with

Rules may optionally be scoped to an account.

Consequences:

- Most common categorization automation is covered.
- Advanced conditional rules are deferred.
- Rule behavior remains explainable and testable.

## ADR 013: Defer Split Transactions

Status: Accepted.

Context:

Splits are useful but add parent/child allocation complexity, validation, reporting expansion, and editing edge cases.

Decision:

V1 uses one category per transaction. Split transactions are deferred to V1.1.

Consequences:

- V1 ledger and reporting are simpler.
- Some real-world transactions will be less precise until V1.1.

## ADR 014: Export in V1, Restore Later

Status: Accepted.

Context:

Data portability is essential, but safe restore requires validation, ID mapping, duplicate handling, rollback, and malicious-file handling.

Decision:

V1 includes transactions export and documented backup package generation. Full restore/import-from-backup is deferred.

Consequences:

- Users can get their data out.
- Backup package format can be designed for future restore.
- Restore complexity does not block V1.

## ADR 015: Include Audit Events in Backup Package

Status: Accepted.

Context:

Audit trail is part of Vault's trust and forensic confidence story.

Decision:

Backup packages include audit events by default. Audit payloads must not contain secrets.

Consequences:

- Backup package is more complete.
- Exports are highly sensitive.
- Future reduced-export option can be added later.

## ADR 016: Use Export Jobs

Status: Accepted.

Context:

Exports may be small in V1 but can grow. Export history and auditability matter.

Decision:

Every export creates an `export_jobs` record. Small exports may complete synchronously at first.

Consequences:

- UI has a stable export status model.
- Async export can be added later without changing product shape.
- Export actions are easier to audit.

## ADR 017: Internal Synthetic Demo Data Only

Status: Accepted.

Context:

Demo data is useful for development, QA, screenshots, and onboarding dry-runs. Public demo mode adds security and operational complexity.

Decision:

V1 includes synthetic seed/demo data for internal development and QA. Public demo mode is deferred.

Consequences:

- Safer V1 scope.
- UI can still be tested with realistic data.
- Public demo can be added after private beta hardening.

## Open Decisions

### Product Name

Status: Open.

Notes:

Naming should be handled with human creativity. Avoid overly literal names unless they genuinely feel right.

### Repo Name

Status: Open.

Notes:

Repo name should follow the final product name.
