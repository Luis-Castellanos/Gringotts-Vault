# Vault UI Cleanup Plan

## Status

Active focus. Feature work is paused until the app has a coherent visual system, shared layout primitives, and a verified page-by-page cleanup pass.

## Objective

Make Vault feel like one product instead of a set of feature explorations. The cleanup should improve consistency without changing domain behavior, schema, or product scope.

## Freeze Rules

- Do not add new product features during this track.
- Do not add new routes unless they are needed only to verify shared UI primitives.
- Do not change data models, migrations, parser behavior, or financial calculations unless required to fix a UI bug.
- Do not redesign one page in isolation if the change should be solved as a shared primitive.
- Keep every cleanup patch visually scoped and easy to review.

## Design Direction

Vault should read as a calm, dense, high-trust financial workspace:

- Dark mode uses Chase-style charcoal surfaces, not black or green-black.
- Light mode uses warm cream surfaces instead of stark white.
- Dark-mode app chrome and action accents are Chase-inspired blue.
- Light-mode action accent is Chase-inspired blue.
- Positive movement remains green in both themes.
- Coral/red only for negative amounts, destructive actions, and warnings.
- Category colors are allowed, but they should not dominate page chrome.
- No decorative gradients, oversized hero sections, or marketing-style copy.
- Dense financial pages should favor tables, rows, panels, and grouped controls over card grids.

## System Decisions To Lock

### Color

- Consolidate token names so pages stop mixing `--color-*` and `--bg` / `--surface` vocabularies without intent.
- Define semantic roles for page background, app chrome, panel, raised panel, hover, selected, border, focus, positive, negative, warning, transfer, and muted data.
- Audit light theme support before expanding it; either make it first-class or remove half-migrated assumptions from pages that are dark-only.

### Typography

- Define one type scale for app chrome, page titles, section titles, metric values, table cells, labels, captions, and helper text.
- Use tabular numerals for all amounts, balances, percentages, dates in tables, and KPI values.
- Remove ad hoc `text-[...]` choices where a shared component or utility should own the size.
- Keep letter spacing at `0` except uppercase labels where spacing improves scanability.

### Layout

- Standardize the app shell: top bar height, sidebar width behavior, page gutters, max content widths, and mobile collapse.
- Standardize page headers: title, subtitle, action row, tabs, and filters.
- Standardize panel spacing and radius; avoid nested cards.
- Use predictable responsive breakpoints for dashboards, tables, forms, and detail pages.

### Components

Create or harden shared primitives before continuing page-specific polish:

- `PageShell`
- `PageHeader`
- `SectionHeader`
- `Panel`
- `MetricTile`
- `Toolbar`
- `FilterBar`
- `DataTable`
- `EmptyState`
- `Button`
- `IconButton`
- `Input`
- `Select`
- `Tabs`
- `Modal`
- `Badge`
- `Amount`

## Audit Order

1. App shell: `TopBar`, `Sidebar`, route layout, page gutters.
2. Global tokens: `app/globals.css`, theme naming, focus, typography utilities.
3. Shared primitives: headers, panels, buttons, inputs, metric tiles, badges.
4. Core pages: Dashboard, Transactions, Cashflow, Net Worth, Accounts, Review.
5. Supporting pages: Upload, Files, Reports, Settings, Categories.
6. Advanced/prototype pages: Credit Cards, Investments, Payroll, Real Estate, Goals, Tax.
7. Loading, empty, error, and destructive states across all pages.

## Acceptance Criteria

- `npm run typecheck` passes.
- A production build passes before the cleanup track is considered complete.
- Every core page uses the same page header, spacing rhythm, panel treatment, button hierarchy, and numeric typography.
- No core workflow has clipped text, horizontal overflow, unreadable contrast, accidental wrapping, or default browser control typography.
- Mobile layouts are intentionally supported or explicitly marked desktop-only.
- New visual decisions are documented in this file or `DESIGN.md`.

## First Pass Checklist

- [x] Fix malformed or duplicated global CSS.
- [x] Normalize the active light/dark token bridge for global Tailwind classes and page-scoped CSS variables.
- [x] Define initial shared component APIs for panels, metric tiles, section headers, and amounts.
- [ ] Replace page-local card/header styles in Dashboard with shared primitives.
- [ ] Audit the sidebar and top bar for typography, spacing, icon weight, and selected states.
- [ ] Audit Transactions for table density, filter controls, expanded rows, and mobile behavior.
- [ ] Audit Cashflow, Net Worth, and Accounts for chart and metric consistency.
- [ ] Add browser screenshots for desktop and mobile verification before finalizing major visual changes.
