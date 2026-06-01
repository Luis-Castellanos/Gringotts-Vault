# Vault Product Roadmap

## Product Vision

Vault is a production-grade personal finance app for people who want deeper understanding, ownership, and trust than mainstream finance apps provide.

It should eventually replace Monarch Money for users who care about:

- Owning and auditing their financial data.
- Beautiful, flexible reporting.
- Accurate statement-backed history.
- Household-level finance management.
- Rich categorization and review workflows.
- Long-term planning without guilt-driven budgeting.
- Exportability and portability.

Vault is not a budgeting coach first. It is a financial operating system: record, reconcile, understand, project, and decide.

## Product Principles

1. **Trust beats automation.** Automation is valuable only when the user can inspect, correct, and understand it.
2. **Statements are source material.** Bank sync is convenience; statements, imports, balances, and audit trails provide durable truth.
3. **Reporting is the core product.** Transactions are the raw material. Reports are the payoff.
4. **The ledger must be explainable.** Every derived number should be traceable to accounts, transactions, imports, categories, and rules.
5. **The app should be calm.** No shame, no streaks, no guilt alerts. Surface reality clearly.
6. **Power can be progressive.** Simple flows first; advanced controls available when needed.
7. **Multi-user from the data model up.** Even if v1 starts single-user, households, ownership, roles, and permissions must not be retrofitted later.
8. **Local confidence before integrations.** Manual and file-based workflows should be excellent before Plaid-style sync.

## Target Users

### Primary: Power Personal Finance User

Someone who already uses Monarch, YNAB, Empower, spreadsheets, or custom exports, and wants more depth and control.

Needs:

- Accurate transactions and balances.
- Custom categories and rules.
- Net worth and cashflow reporting.
- Import/export.
- Confidence that data is private and portable.

### Secondary: Household Finance Partner

A spouse, partner, or trusted household member who needs shared visibility without owning every admin decision.

Needs:

- Simple shared dashboards.
- Clear permissions.
- Low-risk collaboration.
- Mobile-friendly review and browsing.

### Future: Self-Hosted / Privacy-Oriented User

A user who wants control over hosting, data, and integrations.

Needs:

- Documented deployment.
- Backup and restore.
- Minimal vendor lock-in.
- Strong secrets and key management.

## Product Scope Model

Vault should be planned as a layered product, not a giant feature list.

### Layer 1: Identity and Ownership

- Users
- Households
- Membership roles
- Sessions
- Invitations
- Audit logs

### Layer 2: Financial System of Record

- Institutions
- Accounts
- Transactions
- Categories
- Merchants
- Imports
- Documents
- Balances
- Rules

### Layer 3: Workflow

- Upload/import
- Review queue
- Categorization
- Transfer matching
- Duplicate detection
- Reconciliation
- Export/backup

### Layer 4: Reporting

- Dashboard
- Transactions
- Cashflow
- Net worth
- Category detail
- Merchant detail
- Account detail

### Layer 5: Expansion

- Goals
- Forecasting
- Investments
- Payroll
- Real estate
- Tax prep
- AI-assisted classification
- Bank sync
- Mobile app

## MVP Definition

The MVP is not "Monarch, but smaller." It is the smallest production-grade finance ledger that earns user trust.

### MVP Must Have

- Secure account creation and login.
- Household/workspace creation.
- Manual accounts.
- CSV import for transactions.
- PDF/document storage only if the parser is ready; otherwise document attachment can be deferred.
- Transaction table with search, filters, sort, edit, and bulk actions.
- Category taxonomy with parent/child categories.
- Merchant normalization and rules.
- Review queue for uncategorized or uncertain transactions.
- Transfer marking.
- Cashflow report.
- Net-worth report.
- Export transactions to CSV.
- Backup/restore strategy.
- Audit log for destructive or financially meaningful actions.
- Demo mode with synthetic data.

### MVP Should Not Include

- Bank sync.
- Full tax engine.
- Real estate module.
- Payroll parser.
- Investment lots/performance.
- AI auto-actions.
- Native mobile app.
- Payments/subscriptions.

Those are valuable, but they belong after the core ledger is durable.

## Release Phases

### Phase 0: Product Definition and Technical Reset

Goal: Convert the prototype into a production plan.

Deliverables:

- Product requirements document.
- Data model v1.
- Security model.
- UX information architecture.
- Engineering standards.
- New repo scaffold.
- CI pipeline.
- Demo data plan.

Exit criteria:

- Core entities are modeled with household ownership.
- App can build, lint, typecheck, and test in CI.
- Security checklist is documented before feature work begins.

### Phase 1: Secure Ledger Foundation

Goal: Create the trustworthy core.

Features:

- Auth.
- Household/workspace model.
- Roles: owner, admin, member, viewer.
- Institutions and accounts.
- Category taxonomy.
- Manual transaction CRUD.
- CSV import.
- Transaction list.
- Audit log.

Exit criteria:

- A user can create a household, add accounts, import transactions, edit transactions, and export data.
- All API/data access paths enforce household ownership server-side.
- All write endpoints validate input with runtime schemas.

### Phase 2: Review and Categorization

Goal: Make cleanup fast and reliable.

Features:

- Review queue.
- Merchant normalization.
- Category rules.
- Bulk categorization.
- Duplicate detection.
- Transfer detection/marking.
- Import provenance.
- Undo for recent categorization changes.

Exit criteria:

- Imported transactions can be cleaned to 100% reviewed without direct database edits.
- Rules are explainable and reversible.
- Every rule application records provenance.

### Phase 3: Core Reporting

Goal: Deliver the emotional payoff.

Features:

- Dashboard.
- Cashflow report.
- Net-worth report.
- Account detail.
- Category detail.
- Merchant detail.
- Saved filters.
- Exportable report snapshots.

Exit criteria:

- A user can answer: "Where did my money go?", "What changed?", "What is my net worth?", and "Can I trust this number?"
- Report numbers link back to underlying transactions.

### Phase 4: Statement-First Import and Reconciliation

Goal: Differentiate Vault from generic finance apps.

Features:

- Document upload.
- Parser job queue.
- Statement period tracking.
- Statement control totals.
- Running balance capture where available.
- Reconciliation timeline.
- Import health dashboard.

Exit criteria:

- Statement imports can be audited against stated balances and totals.
- Parser failures are visible, resumable, and never silently corrupt the ledger.

### Phase 5: Household Collaboration

Goal: Make Vault useful for real shared finances.

Features:

- Invitations.
- Role management.
- Activity log.
- Optional account visibility controls.
- Comment/note workflow for transaction review.
- Shared rules with admin approval.

Exit criteria:

- A household can collaborate without every member having unrestricted admin power.

### Phase 6: Advanced Planning

Goal: Add planning without making the app prescriptive.

Features:

- Goals.
- Forecasting.
- Recurring transactions.
- Scenario planning.
- Cash runway.
- Debt payoff modeling.

Exit criteria:

- Planning features are derived from the ledger but remain clearly labeled as projections.

### Phase 7: Integrations and Automation

Goal: Add convenience after trust is established.

Features:

- Bank sync provider evaluation.
- Background sync.
- Webhooks.
- AI-assisted categorization.
- Market data.
- Notifications.

Exit criteria:

- External integrations cannot overwrite user-reviewed truth without review or clear provenance.

### Phase 8: Domain Modules

Goal: Bring back prototype depth on top of the stable platform.

Candidate modules:

- Investments.
- Payroll.
- Real estate.
- Tax workspace.
- Documents vault.
- Custom reports.

Exit criteria:

- Each module has its own data model, permissions, tests, and import/export plan.

## Product Requirements by Area

### Accounts

Must support:

- Multiple account types.
- Active/closed status.
- Manual balance snapshots.
- Imported balance snapshots.
- Account grouping.
- Account visibility controls.
- Institution metadata.

Product questions:

- Should closed accounts appear in historical reports by default?
- Should account balances be transaction-derived, snapshot-derived, or hybrid per account type?
- How should credit card balances be displayed relative to net worth?

### Transactions

Must support:

- Date and posted date.
- Amount signed from account-holder perspective.
- Merchant.
- Raw description.
- Category.
- Account.
- Notes.
- Tags.
- Review state.
- Import provenance.
- Split state.
- Transfer state.

Product questions:

- Should splits be first-class ledger rows or child allocations?
- How should refunds be represented in outflow categories?
- Should deleted transactions be soft-deleted?

### Categories

Must support:

- Parent/child hierarchy.
- Flow type: inflow, outflow, transfer.
- Archived categories.
- Custom ordering.
- Icons/colors.
- Household ownership.

Product questions:

- Should default categories be editable or copied into each household?
- Should category changes retroactively affect reports?

### Imports

Must support:

- Source file.
- Source type.
- Parser version.
- Import status.
- Duplicate detection.
- Row-level provenance.
- Reprocessing.
- Rollback.

Product questions:

- What formats are v1?
- What import preview is required before committing rows?
- Should imports require approval before applying category rules?

### Reports

Must support:

- Traceable totals.
- Date ranges.
- Account filters.
- Category filters.
- Household scoping.
- Saved views.
- Export.

Product questions:

- Which reports are core navigation vs advanced workspace?
- Should reports be precomputed for performance?

## Success Metrics

For the early product, avoid vanity metrics. Measure trust and utility.

- Successful imports without manual database repair.
- Percent of transactions reviewed.
- Time to clean a monthly import.
- Number of report numbers traceable to source transactions.
- Build and deploy success rate.
- Test coverage for ledger-critical logic.
- Zero known high-severity auth/data isolation issues.
- User confidence: "I would rely on this instead of Monarch for a month."

## Roadmap Rules

- No feature ships without a data ownership model.
- No financial write path ships without validation, authorization, and audit logging.
- No import path ships without rollback or reprocessing strategy.
- No AI feature ships without usage caps and human review boundaries.
- No reporting feature ships unless its totals can be traced.
- No production deployment ships with demo, preview, and production sharing the same database or secrets.
