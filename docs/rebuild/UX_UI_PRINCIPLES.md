# Vault UX and UI Principles

## UX Vision

Vault should feel like a calm, high-trust financial workspace. It should be dense enough for power users, but not visually noisy. It should make financial truth easier to inspect.

The app should not feel like a marketing dashboard, a crypto trading terminal, or a gamified budget coach. It should feel like a serious personal operating system with excellent taste.

## UX Principles

1. **Clarity before delight.** Financial data must be legible, scannable, and explainable.
2. **Progressive complexity.** Default views are simple; advanced controls are close by.
3. **Every number should have a path.** Important totals should drill into their source rows.
4. **Review is a workflow, not a chore.** Categorization, imports, and reconciliation should feel fast and reversible.
5. **Design for repeated use.** The user will scan the same pages often; avoid novelty that slows them down.
6. **Use visual weight sparingly.** Emphasize anomalies, deltas, review states, and decisions.
7. **Respect privacy in shared settings.** Multi-user households need clear boundaries around visibility and control.

## Information Architecture

### Primary Navigation

- Dashboard
- Transactions
- Cashflow
- Net Worth
- Accounts
- Review
- Imports
- Reports
- Settings

### Secondary/Future Navigation

- Goals
- Forecasting
- Investments
- Documents
- Payroll
- Real Estate
- Tax

Future modules should not crowd the core nav until they are production-ready. Prototype breadth should become release discipline.

## Core Screens

### Dashboard

Purpose: "What changed, and what needs attention?"

Must show:

- Net worth headline and delta.
- Current month cashflow.
- Review queue count.
- Recent imports and import health.
- Top spending changes.
- Account balance snapshot.
- Alerts only for system health or user-requested watch items.

Avoid:

- Motivational copy.
- Shame language.
- Huge empty hero areas.
- Decorative cards that reduce information density.

### Transactions

Purpose: Ledger inspection and editing.

Must support:

- Search.
- Date range.
- Account filter.
- Category filter.
- Merchant filter.
- Review status.
- Split/transfer state.
- Bulk select.
- Inline edit.
- Keyboard-friendly review.
- Saved views.

UX notes:

- The table/list should be the star.
- Row expansion should reveal details without navigating away.
- Bulk actions should be explicit and reversible where possible.
- Raw statement text should be accessible, but not visually dominant.

### Review Queue

Purpose: Fast, confident cleanup.

Must support:

- One-at-a-time review mode.
- Batch review mode.
- Suggested category with explanation.
- Similar past transactions.
- Apply to merchant.
- Skip.
- Undo.
- Rule creation.

UX notes:

- The primary action should be obvious.
- Suggestions must show why they exist.
- The user should never wonder whether they changed one row or many.

### Imports

Purpose: Bring data in safely.

Must support:

- Upload/import status.
- Preview before commit.
- Duplicate warnings.
- Parser confidence.
- Imported row count.
- Failed rows.
- Reprocess.
- Rollback.
- Source file download.

UX notes:

- Import is a staged workflow: upload, parse, preview, commit, review.
- Do not silently mutate large amounts of financial data.
- Failed imports should be useful, not scary.

### Cashflow

Purpose: Explain income, spending, and net flow.

Must support:

- Monthly, quarterly, yearly views.
- Income vs spending vs net.
- Category breakdown.
- Merchant breakdown.
- Account filters.
- Comparison to prior period.
- Drill-down to transactions.

UX notes:

- Positive and negative flows should be visually distinct.
- Avoid overloaded charts.
- Use tables next to charts when exact values matter.

### Net Worth

Purpose: Explain assets, liabilities, and trend.

Must support:

- Net worth trend.
- Assets and liabilities split.
- Account grouping.
- Account drill-down.
- Snapshot vs transaction-derived balance indicators.
- Closed account visibility controls.

UX notes:

- Make data freshness visible.
- Distinguish estimated, imported, synced, and manually entered balances.

### Accounts

Purpose: Configure financial objects.

Must support:

- Add/edit/close accounts.
- Institution details.
- Account type.
- Visibility.
- Manual balance snapshots.
- Merge duplicate accounts.
- Account-specific import mapping.

UX notes:

- This is a settings/workbench surface, not the main reporting view.
- Dangerous actions need confirmation and audit logging.

### Settings

Purpose: Control the system.

Must support:

- Profile.
- Household members and roles.
- Categories.
- Rules.
- Import mappings.
- Security.
- Connected integrations.
- Export/backup.
- Data deletion.

UX notes:

- Destructive controls belong in a clearly separated area.
- Security status should be understandable without jargon.

## Visual Design Direction

### Tone

Calm, precise, modern, and confident.

### Layout

- Use an app-shell layout with persistent navigation.
- Favor full-width work surfaces over nested cards.
- Use cards for repeated entities, modals, and compact summaries only.
- Keep dense tools dense, but maintain readable spacing.
- Avoid oversized marketing-style heroes inside the app.

### Typography

- Use clear hierarchy.
- Reserve large display type for page-level metrics.
- Avoid tiny low-contrast text for financial values.
- Use tabular numerals for money and tables.

### Color

- Use color semantically: inflow, outflow, transfer, review, warning, success.
- Avoid a one-note palette.
- Ensure charts remain readable in light and dark modes.
- Use accessible contrast for all text and data visualization.

### Tables and Lists

- Financial rows should align dates, merchants, accounts, categories, and amounts predictably.
- Amounts should be right-aligned.
- Row actions should be available but not noisy.
- Empty states should explain the next action.

### Charts

- Charts should answer one question at a time.
- Every chart should have exact values available through tooltip, table, or drill-down.
- Avoid chart types that are visually impressive but analytically weak.
- Sankey and complex flow charts should be advanced views, not the default.

## Interaction Standards

### Forms

- Validate client-side for convenience and server-side for truth.
- Use clear error messages.
- Keep money inputs predictable.
- Preserve partially entered data when validation fails.

### Destructive Actions

Require confirmation for:

- Delete account.
- Delete import.
- Bulk delete transactions.
- Reset categories.
- Remove household member.
- Change role.
- Delete household.

For each destructive action:

- Explain impact.
- Show object count when available.
- Prefer soft delete or reversible action for financial records.

### Multi-User UX

Every shared or collaborative surface should answer:

- Who can see this?
- Who can edit this?
- Who changed this?
- Can this be undone?

Role-sensitive UI should hide unavailable actions, but server authorization must still enforce permissions.

## Accessibility

Minimum bar:

- Keyboard navigation for core workflows.
- Visible focus states.
- Accessible contrast.
- Screen-reader labels for icon-only buttons.
- No color-only status indicators.
- Reduced-motion support.

## Mobile Strategy

The web app should be responsive from the start, but mobile should prioritize:

- Review queue.
- Dashboard glance.
- Transaction lookup.
- Import status.
- Account balances.

Heavy admin flows can remain desktop-first until the core product is stable.
