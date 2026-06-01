# Vault Security and Privacy Plan

## Security Posture

Vault handles highly sensitive personal financial data. Security is not a polish phase. It is part of product scope.

Core rule:

> Never trust the client.

Every user ID, household ID, account ID, role, limit, import state, AI action, and financial write must be validated and authorized server-side.

This plan incorporates the security themes from the `raroque/vibe-security-skill` project: secrets hygiene, server-side authorization, rate limiting, safe AI integration, deployment separation, and strict data access control.

## Data Classification

### Highly Sensitive

- Bank transactions.
- Account names and balances.
- Uploaded statements.
- Paystubs.
- Tax documents.
- Institution identifiers.
- API keys.
- Bank sync tokens.
- Session tokens.

### Sensitive

- Categories.
- Merchant rules.
- Goals.
- Reports.
- Household membership.
- Audit logs.

### Public/Low Sensitivity

- Marketing site content.
- Generic product documentation.
- Demo data, if fully synthetic.

## Authentication

Recommended v1 options:

- Managed auth provider for production speed and safety, or
- Passkey-first custom auth only if ownership and session implementation are carefully tested.

Requirements:

- HttpOnly, Secure, SameSite cookies.
- CSRF strategy for cookie-authenticated writes.
- Session rotation where appropriate.
- Logout invalidation.
- Multi-device support.
- Recovery flow.
- Rate limits on auth endpoints.

Do not store auth tokens in localStorage.

## Authorization

Middleware is helpful but insufficient.

Every server route/action/data function must enforce:

1. User is authenticated.
2. User belongs to the household.
3. User has the role required for the action.
4. The target resource belongs to that household.

Roles:

- `owner`: full control, billing/export/delete.
- `admin`: manage financial data and members except ownership transfer/delete household.
- `member`: view and edit normal financial data.
- `viewer`: read-only.

Future account-level permissions may be needed, but household-level roles should ship first.

## Multi-User Data Isolation

Rules:

- Every financial table has `household_id`.
- Every query includes authorized household context.
- Never trust `household_id` from request body without checking membership.
- Prefer `deleteMany/updateMany` with `id` plus `household_id` filters over single-row update by `id` alone.
- Add tests proving cross-household access fails.

Critical test cases:

- User A cannot fetch User B's account by ID.
- User A cannot update User B's transaction by guessing UUID.
- Viewer cannot create, update, import, or delete financial records.
- Removed member loses access immediately.

## Secrets

Requirements:

- No secrets in source code.
- `.env` files ignored before first commit.
- `.env.example` contains placeholders only.
- No secret values in client-exposed env vars.
- No database URLs, AI keys, bank sync secrets, JWT secrets, or webhook secrets in `NEXT_PUBLIC_*`.
- Run secret scanning in CI.

If a secret enters git history:

1. Rotate it immediately.
2. Remove from active environments.
3. Clean history only as a secondary hygiene step.

## Application Secrets Stored by Vault

If Vault allows users to store API keys, bank tokens, or provider credentials:

- Encrypt at rest with envelope encryption.
- Never return full secrets to the client after save.
- Show only status or last four characters.
- Record when a secret was created, rotated, or removed.
- Keep encryption keys outside the database.

The prototype stores app settings as plaintext DB values. Production should not do that for sensitive provider keys.

## AI Security

AI features are optional and must be bounded.

Requirements:

- AI provider keys are server-side only.
- Per-user and per-household usage limits.
- Provider-level hard spend caps.
- Prompt and output logging policy that avoids storing unnecessary sensitive data.
- Human review before AI changes financial records.
- AI output treated as untrusted.
- Function/tool calls validated with schemas and allowlists.

Allowed early AI use:

- Suggest a category.
- Suggest merchant cleanup.
- Explain why a transaction was classified.

Not allowed early:

- Bulk mutate without confirmation.
- Execute arbitrary database queries.
- Generate SQL from user prompts.
- Access unrelated household data.

## Rate Limiting and Abuse Prevention

Rate limit:

- Login/register/passkey challenge endpoints.
- File uploads.
- Import parsing.
- AI categorization.
- Export generation.
- Invitation emails.
- Password/recovery flows, if any.

Use both:

- Per-IP limits.
- Per-user or per-household limits.

Use server-side counters, not client-controlled counters.

## File Upload Security

Requirements:

- File size limit.
- File type allowlist.
- MIME type and magic byte validation.
- Virus/malware scan if practical.
- Store outside public web root.
- Signed URLs for access.
- Ownership checks before download.
- Parser sandboxing or isolation for risky file processing.
- Parser timeouts.

Never assume a PDF is safe just because it has `.pdf` in the filename.

## Import Safety

Requirements:

- Import preview before commit.
- Duplicate detection.
- Parser version recorded.
- Source file provenance retained.
- Rollback support.
- Failed row visibility.
- Reprocessing support.
- Audit event for commit/rollback.

Imports should never silently overwrite user-reviewed data.

## Database Security

Even without Supabase public APIs, enforce defense in depth:

- Least-privilege database user for app runtime.
- Separate migration/admin credentials.
- No production database access from preview deployments.
- Backups enabled.
- Point-in-time recovery where available.
- Slow query monitoring.
- Query parameterization.
- No raw SQL with user input.

If using Supabase:

- Enable RLS on every exposed table.
- Scope policies by `household_id`/membership.
- Never use broad `USING (true)` policies.
- Include `WITH CHECK` on inserts/updates.
- Keep privileged functions in private schemas.

## Deployment Security

Requirements:

- Separate production, staging, preview, and local environments.
- No production keys in preview.
- Security headers.
- HTTPS only.
- Source maps disabled or access-controlled in production.
- Debug mode off.
- CORS restricted to known origins.
- Dependency audit in CI.
- Secret scan in CI.

Suggested headers:

- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy`

## Privacy Principles

Vault should collect the minimum data needed to serve the product.

Rules:

- No sale of user data.
- No third-party analytics on sensitive app pages without explicit review.
- Avoid logging raw transaction descriptions unless needed for debugging.
- Give users export and delete controls.
- Make data retention explicit.
- Use synthetic data for demos.

## Audit and Compliance Mindset

Vault does not need enterprise compliance on day one, but it should behave like a serious financial-data app.

Maintain:

- Audit events.
- Access logs for sensitive actions.
- Export logs.
- Import provenance.
- Role-change history.
- Security checklist for each release.

## Pre-Release Security Gate

Before any public or semi-public release:

- All auth endpoints rate-limited.
- Cross-household access tests pass.
- Viewer role mutation tests pass.
- Secret scan passes.
- Dependency audit reviewed.
- Production secrets separated from preview.
- Backups tested.
- Export tested.
- Delete/retention behavior documented.
- AI usage caps configured if AI is enabled.
- Uploaded files require authorization to access.
- Security headers configured.

No exceptions for financial data.
