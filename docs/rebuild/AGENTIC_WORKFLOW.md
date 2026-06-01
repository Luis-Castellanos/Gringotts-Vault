# Vault Agentic Build Workflow

## Purpose

Vault will likely be built with heavy AI assistance. That can be a major advantage, but only if the process prevents the usual failure modes: overbuilding, stale docs, insecure shortcuts, unreviewed schema drift, and features that look complete before they are reliable.

This workflow adapts the useful parts of `kliewerdaniel/workflow`: department-first planning, explicit checklists, implementation ledgers, documentation-first development, and AI collaboration rules.

## Core Principle

AI can accelerate implementation, but product judgment, data correctness, security boundaries, and release scope must be explicit before code is written.

For Vault, no substantial feature should begin with "just build it." It should begin with:

1. What user problem does this solve?
2. What data does it touch?
3. Who can access or change it?
4. How can it fail?
5. How will we test it?
6. How will the user recover or undo it?

## Department-First Workflow

Every significant feature passes through these departments.

### 1. Product Requirements

Define:

- User story.
- Target user.
- In-scope behavior.
- Out-of-scope behavior.
- Edge cases.
- Acceptance criteria.
- UX states.
- Data touched.
- Security/privacy implications.

Output:

- Issue or spec section.
- Acceptance checklist.

### 2. Architecture

Define:

- Domain model.
- API/server action shape.
- Database tables/columns.
- Ownership model.
- Background jobs, if any.
- Integration boundaries.
- Migration strategy.
- Observability needs.

Output:

- Architecture note.
- Schema diff proposal.
- Migration plan.

### 3. UX/UI Design

Define:

- Primary workflow.
- Empty/loading/error/success states.
- Desktop and mobile behavior.
- Accessibility requirements.
- Navigation placement.
- Destructive action handling.
- Audit/reversibility cues.

Output:

- Screen notes or wireframe.
- Component/state checklist.

### 4. Security Review

Define:

- Auth required?
- Role required?
- Household ownership enforced?
- Runtime input validation?
- Rate limit required?
- Audit log required?
- Secret handling?
- File upload or AI risk?

Output:

- Security checklist completed before merge.

### 5. Implementation

Rules:

- Keep changes scoped.
- Build domain logic outside UI.
- Add runtime validation at boundaries.
- Add tests alongside logic.
- Use migrations, not production `db:push`.
- Do not mix unrelated refactors.

Output:

- Pull request with code, tests, migration, and docs.

### 6. Testing and QA

Required test categories:

- Unit tests for business logic.
- Integration tests for data access and API.
- Authorization tests.
- UI flow tests where user behavior matters.
- Regression tests for discovered bugs.

Output:

- Passing CI.
- Manual QA notes for high-risk flows.

### 7. Deployment and Operations

Define:

- Environment variables.
- Migration rollout.
- Backfill steps.
- Rollback strategy.
- Monitoring/logging.
- Support/recovery procedure.

Output:

- Release checklist.
- Changelog entry.

## Feature Spec Template

Use this for every meaningful feature.

```md
# Feature: [Name]

## Problem

## Users

## Goals

## Non-Goals

## User Stories

## UX Flow

## Data Model

## API / Server Actions

## Authorization

## Validation

## Audit Logging

## Edge Cases

## Tests

## Rollout

## Open Questions
```

## AI Collaboration Rules

### Before Asking AI To Code

Provide:

- Current feature spec.
- Relevant files.
- In-scope changes.
- Out-of-scope changes.
- Expected tests.
- Security constraints.

Avoid vague prompts like:

- "Make this better."
- "Add the whole dashboard."
- "Build Monarch."

Use prompts like:

- "Implement CSV import preview only. Do not commit transactions yet. Add unit tests for duplicate detection and integration tests for household ownership."

### During AI Coding

Require the agent to:

- Read existing patterns first.
- Explain assumptions.
- Keep edits scoped.
- Add or update tests.
- Run verification commands.
- Summarize changed files.

### After AI Coding

Review for:

- Hidden scope expansion.
- Security bypasses.
- Missing authorization.
- Missing validation.
- Database ownership mistakes.
- Untested financial calculations.
- UI states not handled.
- Stale docs.

## Prompt Patterns

### Product Manager Prompt

```text
Act as product manager for Vault. Turn this idea into a scoped feature spec.
Include user problem, goals, non-goals, acceptance criteria, UX states,
data touched, permissions, edge cases, metrics, and release phase.
```

### Architecture Prompt

```text
Act as senior architect for Vault. Design the backend/data architecture for
this feature. Include tables, ownership model, indexes, migrations, API
shape, background jobs, failure modes, and tests. Prioritize correctness,
security, and maintainability over speed.
```

### Security Prompt

```text
Audit this Vault feature for security and privacy issues. Focus on auth,
authorization, household isolation, secrets, input validation, file handling,
rate limits, AI usage, audit logs, and cross-user data leakage.
```

### UX Prompt

```text
Act as product designer for Vault. Design the user flow and UI states for
this feature. Prioritize clarity, repeated use, accessibility, mobile behavior,
empty/loading/error states, and traceability of financial data.
```

### Implementation Prompt

```text
Implement only the scoped feature described below. Follow Vault engineering
rules: validate inputs, enforce household authorization server-side, add tests,
update docs, avoid unrelated refactors, and run verification.
```

## Progress Ledger

Maintain a lightweight ledger for long-running work.

Recommended columns:

| Date | Department | Activity | Decision | Status | Link |
|------|------------|----------|----------|--------|------|

Status values:

- `planned`
- `in_progress`
- `blocked`
- `done`
- `deferred`

Use the ledger for:

- Product decisions.
- Architecture decisions.
- Security decisions.
- Migration decisions.
- Release decisions.

Do not use it for every tiny code change.

## Decision Records

Use short ADRs for decisions that will be expensive to reverse.

Examples:

- ORM choice.
- Auth provider.
- Object storage vs Postgres `bytea`.
- Bank sync provider.
- Money storage format.
- Split transaction model.
- Household permission model.

Template:

```md
# ADR: [Decision]

## Status

## Context

## Decision

## Consequences

## Alternatives Considered
```

## Definition of Ready

A feature is ready to implement when:

- Problem and target user are clear.
- Scope and non-goals are written.
- Data model impact is known.
- Permission model is known.
- UX states are known.
- Tests are identified.
- Risks are named.

## Definition of Done

A feature is done when:

- Code is merged.
- Tests pass.
- Build passes.
- Security checklist passes.
- Docs are updated.
- Migration is committed, if needed.
- Audit logging exists for meaningful writes.
- Empty/loading/error states exist.
- User-facing behavior matches acceptance criteria.

## AI Risk Controls

Common AI-assisted development risks and Vault controls:

| Risk | Control |
|------|---------|
| Overbuilding | Require non-goals and phase placement |
| Insecure endpoint | Require auth/authorization checklist |
| Cross-household data leak | Require household isolation tests |
| Bad financial math | Require unit tests with fixtures |
| Schema drift | Require migrations and ADRs |
| Stale docs | Docs updated in definition of done |
| Pretty but unusable UI | UX states and workflow acceptance criteria |
| Silent import corruption | Import preview, provenance, rollback |
| AI cost runaway | Rate limits and usage caps |

## Weekly Rebuild Ritual

For a long roadmap, run a weekly review:

1. What shipped?
2. What changed in product understanding?
3. What decisions were made?
4. What risks increased?
5. What docs are stale?
6. What tests are missing?
7. What is the next smallest production-grade milestone?

The goal is steady compounding quality, not a heroic rewrite sprint.
