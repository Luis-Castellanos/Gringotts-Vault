---
version: alpha
name: Gringotts Vault Finance System
description: Sleek personal finance dashboard system inspired by Chase-style dark surfaces, blue app chrome, and efficient KPI density.
colors:
  background: "#202324"
  surface: "#171A1B"
  surfaceRaised: "#242829"
  chrome: "#245594"
  lightBackground: "#F3EADC"
  lightSurface: "#FBF4E8"
  lightSurfaceRaised: "#EFE4D2"
  text: "#EEEAE4"
  lightText: "#1D1711"
  muted: "#AAA49A"
  lightMuted: "#746655"
  border: "#263226"
  accent: "#5AA9FF"
  lightAccent: "#005EB8"
  positive: "#67C587"
  negative: "#FF737A"
  warning: "#F2C94C"
typography:
  display:
    fontFamily: "SF Pro Display, ui-sans-serif, system-ui"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.05
  body:
    fontFamily: "SF Pro Text, ui-sans-serif, system-ui"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  dashboard-card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  link-card:
    hoverBackground: "{colors.surfaceRaised}"
    accentColor: "{colors.accent}"
  kpi-tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
---

## Overview

Gringotts Vault uses a modern professional finance aesthetic: Chase-style charcoal dark surfaces, blue app chrome and action states, compact KPI hierarchy, and dense-but-breathable financial panels.

## Colors

- Dark backgrounds should be charcoal, not black.
- Dark-mode app chrome uses Chase-inspired blue (`#245594`), with action links using lighter blue.
- Positive performance uses green, separate from the blue action color.
- Light mode uses warmer cream surfaces, not stark white.
- Light-mode action accent uses Chase-inspired blue (`#005EB8`); positive financial movement remains green so color meaning stays stable.
- Spending and liabilities use coral red sparingly.
- Category colors may remain varied, but should sit on muted dark surfaces.

## Typography

Use tight numeric hierarchy with tabular figures. Dashboard totals should be large and confident; labels stay small, uppercase, and muted.

Shared chrome typography:

- Page titles: 20px, semibold, no negative tracking.
- Section titles: 14px, semibold, no negative tracking.
- Body/chrome copy: 13px, medium-light, 1.45 line-height.
- Captions: 12px, muted, 1.35 line-height.
- Labels: 11px uppercase, semibold, letter-spaced only for scanability.

## Layout

Dashboard screens use an efficient 12-column feeling: a dominant net-worth/cash-flow row, compact KPI strip, then linked operational panels for transactions, spending, and accounts. Avoid both sparse hero-only pages and cramped tables.

## Elevation & Depth

Use borders plus subtle inset/ambient shadows instead of heavy drop shadows. Raised panels may use a faint green glow on hover.

## Shapes

Cards use 18–24px radii. Small row actions use 10–12px radii. Progress bars and chart pills are fully rounded.

## Components

- KPI tiles: label, value, trend/subtext, optional mini indicator.
- Shared primitives live in `components/ui.tsx`; cleanup work should prefer `Panel`, `SectionHeader`, and `Amount` before adding new page-local styles.
- Linked panels: header link target is always real (`/cashflow`, `/transactions`, `/accounts`, `/net-worth`).
- Charts: render real SVG marks with labels and a short interpretation line.

## Do's and Don'ts

Do keep panels linked to deeper routes. Do use compact summaries with breathing room. Don’t use dated bank-dashboard blues, large empty hero zones, or fake disabled links.
