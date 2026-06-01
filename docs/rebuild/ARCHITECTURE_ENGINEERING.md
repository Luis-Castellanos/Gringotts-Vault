# Vault Architecture and Engineering Plan

## Architecture Goals

Vault should be built as a production application, not a collection of screens.

Goals:

- Strong ownership and authorization model.
- Reliable ledger and import pipeline.
- Traceable reporting.
- Repeatable migrations.
- Clear boundaries between product domains.
- Automated tests for financial correctness.
- Deployment confidence.
- Future support for bank sync, AI, and mobile without rewriting the core.

## Recommended Stack

### Application

- Next.js App Router.
- React.
- TypeScript strict mode.
- Server Components by default.
- Client Components only for interaction-heavy UI.

### Database

- Postgres, with Neon Postgres as the V1 private beta target.
- Drizzle ORM.
- SQL migrations committed to the repo.
- Separate databases for development, preview, staging, and production.

### Background Work

Use a background job layer for:

- File parsing.
- Import processing.
- Bank sync.
- AI categorization.
- Report precomputation.
- Email/notification delivery.

Do not run long PDF parsing work inside a request/response path in production.

### Storage

Use object storage for uploaded documents in production, with metadata in Postgres.

The prototype stores PDFs as `bytea`, which is useful for portability and local simplicity. For production, object storage is usually better for:

- Large files.
- Streaming downloads.
- Virus scanning.
- Retention policies.
- Backups.
- CDN/security controls.

If self-hosting portability remains a core product value, document a "Postgres-only mode" as a later deployment option.

## Domain Boundaries

Suggested modules:

- `auth`
- `households`
- `accounts`
- `transactions`
- `categories`
- `merchants`
- `rules`
- `imports`
- `documents`
- `reports`
- `audit`
- `integrations`
- `settings`

Each module should own:

- Schema definitions.
- Server-side data access.
- Runtime validation schemas.
- Route handlers/actions.
- Tests.
- UI components where appropriate.

## Database Design Principles

### Multi-User Core

Every user-owned financial object should be scoped to a household/workspace.

Core tables:

- `users`
- `households`
- `household_members`
- `institutions`
- `accounts`
- `transactions`
- `categories`
- `merchants`
- `merchant_rules`
- `imports`
- `import_rows`
- `documents`
- `balance_snapshots`
- `audit_events`

All financial queries should include `household_id`.

### Ownership Pattern

Use this pattern consistently:

- `household_id` on all household-owned resources.
- `created_by_user_id` for provenance.
- `updated_by_user_id` when useful.
- `deleted_at` for soft delete on financial records.
- `created_at` and `updated_at` everywhere.

Avoid relying on joins through accounts to infer ownership for every query. Direct `household_id` columns make authorization easier, indexes simpler, and query bugs less likely.

### Money

Use integer minor units where possible:

- Store USD cents as `bigint`.
- Store currency code separately.
- Avoid floating point.

If decimal numeric is used, keep conversion helpers centralized and test them heavily.

### Transactions

Transactions are the core ledger. Treat them as durable financial records.

Recommended fields:

- `id`
- `household_id`
- `account_id`
- `category_id`
- `merchant_id`
- `date`
- `posted_date`
- `amount_minor`
- `currency`
- `raw_description`
- `display_name`
- `notes`
- `review_status`
- `transfer_status`
- `source`
- `import_id`
- `external_id`
- `content_hash`
- `deleted_at`
- timestamps

### Splits

Prefer child allocation rows for splits:

- Parent transaction remains the account-balance event.
- Split rows allocate reporting categories and amounts.
- Split rows sum exactly to parent amount.

Use database constraints or transaction-level validation to enforce split sums.

### Imports

Imports should be staged.

Recommended import lifecycle:

1. `uploaded`
2. `parsed`
3. `previewed`
4. `committed`
5. `partially_failed`
6. `rolled_back`

Do not write final ledger rows until the system can explain what will be inserted or changed.

### Audit Log

Audit financially meaningful actions:

- Import committed.
- Import rolled back.
- Transaction created/edited/deleted.
- Bulk category change.
- Rule created/edited/deleted.
- Account merged/closed/deleted.
- Household member invited/removed.
- Role changed.
- Export generated.

Audit rows should include:

- `household_id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `before`
- `after`
- `metadata`
- timestamp

### Migrations

Rules:

- No `db:push` against production.
- Every schema change is a migration.
- Migrations are reviewed.
- Destructive migrations require a rollback or backup plan.
- Seed data is versioned and idempotent.

## Data Access Practices

Use server-only data access modules.

Rules:

- Data access modules import `server-only`.
- Never pass raw request bodies to database writes.
- Validate all external input with runtime schemas.
- Pick allowed fields explicitly.
- Every query checks household membership or receives an authorized household context.
- No client-submitted `user_id`, `household_id`, role, price, rate-limit counter, or permission is trusted.

Recommended pattern:

1. Authenticate.
2. Authorize household membership.
3. Validate input.
4. Execute domain service.
5. Record audit event for meaningful writes.
6. Return a minimal response.

## API Design

Prefer route handlers or server actions consistently. Either way, treat them as public endpoints.

Response pattern:

```ts
type ApiSuccess<T> = { data: T };
type ApiFailure = { error: { code: string; message: string } };
```

Use stable error codes:

- `unauthorized`
- `forbidden`
- `not_found`
- `invalid_input`
- `conflict`
- `rate_limited`
- `import_failed`

## Testing Strategy

V1 test stack:

- Vitest for unit and integration tests.
- React Testing Library for component behavior tests.
- Playwright for end-to-end browser flows.
- A dedicated test database for migration and data-access tests.

### Unit Tests

Required for:

- Money helpers.
- Date-period helpers.
- Merchant normalization.
- Category rule matching.
- Transfer detection.
- Split validation.
- Import hashing/dedupe.
- Report calculations.

### Integration Tests

Required for:

- Auth-protected API routes.
- Household authorization.
- Import commit/rollback.
- Transaction CRUD.
- Category rules.
- Reporting queries.

### End-to-End Tests

Required flows:

- Sign up/sign in.
- Create household.
- Add account.
- Import CSV.
- Review transactions.
- View cashflow.
- Export transactions.

### Security Regression Tests

Required cases:

- User cannot read another household's accounts.
- User cannot update another household's transaction by ID.
- Viewer cannot mutate financial data.
- Client-supplied household IDs are ignored or rejected.
- AI categorization endpoint enforces quota and auth.
- Import endpoint enforces file type, file size, and ownership.

## CI Requirements

Every pull request should run:

- Install with lockfile.
- Typecheck.
- Lint.
- Unit tests.
- Integration tests.
- Build.
- Secret scan.
- Dependency audit.
- Migration check.

Main branch should always be deployable.

## Coding Standards

### TypeScript

- Strict mode.
- No implicit `any`.
- Avoid broad `as any`.
- Use explicit domain types.
- Use runtime schemas at boundaries.

### React

- Server Components for data-heavy pages.
- Client Components for local interaction.
- Avoid fetching sensitive data in Client Components.
- Keep page components thin.
- Extract domain logic out of UI components.

### Styling

- Use design tokens.
- Use consistent spacing and typography.
- Avoid one-off CSS when a component primitive exists.
- Preserve accessibility.

### Error Handling

- User-facing errors should be clear and non-technical.
- Logs should include diagnostic context without leaking secrets or raw financial data unnecessarily.
- Expected failures should not throw generic 500s.

## Observability

Track:

- Import success/failure.
- Parser duration.
- Build/deploy status.
- API error rate.
- Background job failures.
- Slow queries.
- AI usage/cost.
- Login failures.

Add structured logs for:

- Import lifecycle.
- Bank sync lifecycle.
- AI requests.
- Role/member changes.
- Destructive actions.

## Performance Principles

- Index all ownership/filter columns used in common queries.
- Avoid loading all transactions into the browser for large histories.
- Paginate or virtualize long lists.
- Precompute expensive reporting aggregates when data grows.
- Keep report totals consistent with transaction filters.
- Benchmark imports with realistic data.

## Deployment Environments

Use separate:

- Local development.
- Preview.
- Staging.
- Production.

Each environment should have:

- Separate database.
- Separate storage bucket.
- Separate auth config.
- Separate API keys.
- Separate AI quotas.

Preview deployments must never point at production financial data.

## Prototype Migration Strategy

Do not copy the prototype wholesale.

Port in this order:

1. Product principles and domain lessons.
2. Category taxonomy ideas.
3. Merchant cleaning ideas.
4. Transaction/review UX concepts.
5. Cashflow/net-worth report concepts.
6. Parser algorithms after tests exist.
7. Advanced modules only after the core platform is stable.

Treat the old code as a library of discoveries, not the production base.
