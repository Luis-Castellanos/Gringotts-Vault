# Handoff: Income & Payroll (Gringott's / Vault)

## Overview
The Payroll page surfaces a user's CBIZ pay stubs inside the Vault personal-finance app. It has three tabs:

1. **Single stub** — full breakdown of one selected stub: a hero with net pay + a 3-slice donut (net / deductions / taxes), then Earnings, Deductions, Taxes, Employer contributions, and an "Imputed income" informational footnote.
2. **All stubs** — sortable table listing every stub with annotated events (raises, bonuses, W4 changes, ESPP starts).
3. **YTD summary** — year picker (2025 / 2026), big YTD net-pay hero, four metric cards, monthly stacked bar chart with event dots, savings + tax + employer breakdowns, and an events timeline.

The page is part of a 3-page suite (Accounts, Credit Cards, Income & Payroll) that share the same warm-paper aesthetic.

## About the design files
The files in this folder are **design references created in HTML + React-via-Babel** — prototypes showing intended look and behavior, not production code to ship. Recreate the design in the target codebase's existing environment (React/Next, Vue, SwiftUI, Android, etc.) using its established components, design tokens, and routing — or, if the project is greenfield, pick the framework that best fits and implement there.

The CDN-loaded `@babel/standalone` setup is for in-browser prototyping only; replace it with a normal build pipeline.

## Fidelity
**High-fidelity.** All colors, spacing, typography, radii, shadows, and interaction states are final. Recreate pixel-perfectly using the codebase's primitives. Where the codebase already has a button/card/pill/tab component matching this aesthetic, use those instead of re-implementing.

## Design tokens

All tokens live in `:root` and `[data-theme="dark"]` blocks at the top of `Income & Payroll.html`. They are the same tokens used across Accounts and Credit Cards.

### Colors — Light
| Token | Value | Use |
|---|---|---|
| `--bg` | `#faf7f2` | Page background (warm paper) |
| `--surface` | `#fffdf9` | Card background |
| `--surface-hover` | `#f5f0e8` | Hover row/card |
| `--surface-elev` | `#f0ebe2` | Inset wells (deposit list, segmented toggles) |
| `--text-1` | `#1a1815` | Primary text |
| `--text-2` | `#6b6358` | Secondary text |
| `--text-3` | `#8b8278` | Muted / labels |
| `--line` | `rgba(0,0,0,.06)` | Hairline borders |
| `--line-strong` | `rgba(0,0,0,.12)` | Stronger borders, subtotals |
| `--green` / `--green-tint` / `--green-text` | `#16a34a` / `#d4f5e0` / `#15803d` | Net pay, earnings, gains |
| `--blue` / `--blue-tint` / `--blue-text` | `#2563eb` / `#dbeafe` / `#1d4ed8` | Deductions |
| `--red` / `--red-tint` / `--red-text` | `#dc2626` / `#fee2e2` / `#b91c1c` | Taxes, liabilities |
| `--purple` / `--purple-tint` / `--purple-text` | `#7c3aed` / `#ede9fe` / `#6d28d9` | Employer contributions, bonus events |
| `--amber` / `--amber-tint` / `--amber-text` | `#b45309` / `#fef3c7` / `#92400e` | Imputed/informational, W4 events |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,.025), 0 0 0 0.5px var(--line)` | Card shadow |

### Colors — Dark
| Token | Value |
|---|---|
| `--bg` | `#0f0e0c` |
| `--surface` | `#1a1815` |
| `--surface-hover` | `#211e1a` |
| `--surface-elev` | `#14130f` |
| `--text-1` | `#faf7f2` |
| `--text-2` | `#a1998d` |
| `--text-3` | `#6b6358` |
| Accents | Lighter variants of the same hues — see CSS in HTML |

### Typography
- **Family:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`
- **Numerical display:** `ui-rounded, "SF Pro Rounded", -apple-system, …` — used for hero amounts and donut center via class `.num-display`
- **Base body:** 15px / 1.45
- **Page title:** 24px / 700 / letter-spacing `-.02em`
- **Card title:** 16px / 600 / `-.015em`
- **Hero display (net pay):** 48px / 700 / `-.035em`; cents are 0.52em / 600 in `--text-2`
- **YTD hero display:** 56px / 700 / `-.035em`
- **Section eyebrow:** 11px / 600 / `.08em` uppercase / `--text-3`
- **Banner labels:** 11px / 700 / `.08em` uppercase
- **Pill labels:** 10.5px / 700 / `.06em` uppercase
- **Line row amount:** 15px / 600 (configurable via `--line-fz`)
- **Tabular numerals:** `.num` class — `font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`

### Spacing (density tokens)
Three density modes via `[data-density="compact|regular|comfy"]`. Default is `regular`.

| Token | Compact | Regular | Comfy |
|---|---|---|---|
| `--card-pad` | 14 | 18 | 24 |
| `--row-pad` | 8 | 11 | 14 |
| `--gap` | 10 | 12 | 16 |
| `--line-fz` | 13 | 15 | 16 |

Page container: `max-width: 980px; padding: 24px 28px 56px;`

### Radii
- Cards: `16px`
- Banner cards (with colored top strip): `16px` (overflow hidden)
- Inset wells / deposit list: `11px`
- Footnote: `13px`
- Pills: `999px`
- Buttons: `8px`
- Bar chart segments stack: `6px`

### Shadows
- Card: `0 1px 4px rgba(0,0,0,.025), 0 0 0 0.5px var(--line)`
- Hover lift (segmented active): `0 1px 3px rgba(0,0,0,.06), 0 0 0 0.5px var(--line)`

### Easing
- `--ease-back: cubic-bezier(0.34, 1.56, 0.64, 1)` — used on donut slice stroke-width transition (280ms)
- General hover transitions: `150ms ease`
- Theme/density swap: `200ms ease`

## Screens / Views

### Page chrome (all tabs)
- **Breadcrumbs:** `Vault / Income / Payroll` — 12px, `--text-3`, last segment in `--text-1` 500.
- **Page title:** "Income · Payroll" — 24/700.
- **Mode toggle (right):** light/dark icon + label, transparent button with `--line-strong` border, `8px` radius.
- **Tabs:** underline-only style. `display: flex; gap: 26px;` over a 1px `--line` baseline. Active tab is 600 + `--text-1` + 2px `--text-1` border-bottom (`margin-bottom: -1px` to overlap baseline). Tab counts (`13`) shown as 12px `--text-3` 500 with `6px` left margin.

### Tab 1 — Single stub
**Sub-header** (`.stub-bar`):
- Left: date (18px / 600 / `-.015em`), then meta line "{period} · Voucher {id} · ${rate}/yr · + Bonus stub" in 12px `--text-3`.
- Right: prev/next buttons (30×30, 8px radius, `--line` border) with "Stub **N** of 13" between them.

**Hero card** (`.card.hero`):
- Grid `1fr auto`, gap 24, padding `18px 20px`, items centered.
- Left:
  - Eyebrow "Net pay deposited" + right-aligned subtitle "Settled {date} · {n} destinations" — 12.5px / `--text-3`.
  - Display: huge net-pay amount (48px), cents at 0.52em smaller and in `--text-2`.
  - Deposit list — inset well (`--surface-elev`, 11px radius). Each row 9px×13px padding, 14px text; bank-dot 6×6 circle, last4 in `--text-3` 12px, amount 600.
- Right:
  - **Donut chart** — see "Donut" below.

**Donut chart** (`Donut` component):
- SVG `viewBox="0 0 100 100"`, container size from prop (220–400px, default 250). Stroke-width 7.4 base, **grows to 10 on hover** via 280ms `--ease-back` transition.
- Track circle: r=40, stroke `--line` (`rgba(0,0,0,.06)` light / `rgba(255,255,255,.10)` dark).
- Slices use SVG circle with `strokeDasharray`/`strokeDashoffset` math (circumference `2π·40 ≈ 251.33`), starting at 12 o'clock and chaining clockwise. Small gap of 0.8 between slices.
- Three slices: **net** (green), **deductions** (blue), **taxes** (red).
- Center label group (absolute, 180×180 box, pointer-events none):
  - eyebrow 11px uppercase
  - amount 30px / 700 / `-.03em` / num-display
  - percent 12.5px / `--text-2`
- Hover: non-hot slices fade to opacity 0.22; hot slice stroke grows; center label swaps to the hot slice's label + amount + "% of gross". Default center shows "Gross pay" / gross amount / `$X / yr` rate.

**Banner cards** (Earnings / Deductions / Taxes / Employer contributions):
Each is `.card.banner-card` — radius 16, overflow hidden. A top strip (`.card-banner`) in the section's color tint with the section title (uppercase tracking) and a right-aligned meta tag. Body has `--card-pad`.

| Card | Banner color | Banner title | Banner meta |
|---|---|---|---|
| Earnings | green | "Earnings" | "$X / yr" |
| Deductions | blue | "Deductions" | "Pre + post-tax" |
| Taxes | red | "Taxes" | "Withheld at source" |
| Employer | purple | "Employer contributions" | "On top of your pay" |

**Line rows** (`.line-row`):
- Grid `1fr auto auto`, gap 12, row padding `var(--row-pad)` vertical, 1px `--line` top border (no border on first).
- Label: 500 / `--text-1`. Meta: 12px / `--text-3`. Amount: 600 / `--text-1`, tabular nums.
- `.line-row.subtotal` — stronger top border + 600/700 weights.

**Section headers** inside a card (`.line-section-hd`):
- Padding `8px 0 4px`, second+ get top border + 4px margin.
- Title in eyebrow style; right-aligned meta in 12px `--text-3`.

**Deductions/Taxes row** is `.row-pair` — `grid-template-columns: 1fr 1fr; gap: var(--gap)`. Collapses to 1 column under 820px.

**Employer card body** uses an internal 2-column grid (Benefits / Payroll taxes) with the subtotal spanning both columns.

**Imputed footnote** (`.footnote`):
- Grid `auto 1fr auto`, gap 14, padding `13px 16px`, radius 13, `--amber-tint` bg, `--amber-text` foreground.
- Left: 26×26 circle icon with "i", inner bg `color-mix(in srgb, var(--amber) 22%, transparent)`.
- Middle: 14/600 title in `--text-1`, 12.5px desc in `--text-2`.
- Right: two stacked amount cells (LTD / GTLI), eyebrow + value.

### Tab 2 — All stubs (table)
- Sticky header row (`.stubs-list-hd`): grid `130px 1fr repeat(4, 110px)`, gap 12, padding `10px 18px`, eyebrow styling, 1px bottom border.
- Each row (`.stub-list-row`): same grid, padding `12px 18px`, hover `--surface-hover`. Click → jumps to Single tab with that stub selected.
  - Col 1 (date): "Apr 30, 2026" 14/600 over voucher id 11/`--text-3`.
  - Col 2 (period): "Apr 1 – Apr 30, 2026" 13/`--text-2`, optional event chips below (raise / bonus / W4 / ESPP) using `.evt-chip.{green|blue|purple|amber}` — 10px / 700 / uppercase pills.
  - Cols 3–6: right-aligned amounts — Gross, Taxes (red text), Deductions (blue text), Net (green text).

### Tab 3 — YTD summary

**Sub-header** mirrors Single-stub layout but shows "{year} Year-to-date" + "{n} stubs · Partial year · aggregated from CBIZ payroll". Right side: year segmented tabs (2025 / 2026) inside `--surface-elev` pill, each tab 6×14 padding, active gets `--surface` + shadow. Partial years show a tiny amber "Partial" badge.

**YTD hero** (`.ytd-hero`): grid `1fr auto`, padding `22px 24px`, gap 24.
- Left: eyebrow "Net pay deposited · YTD {year}", 56px display amount, then sub stats row "Gross $X · Taxes (yours) $Y · Deductions $Z" — each value bold and tabular.
- Right: "Avg / stub" eyebrow + 22px value.

**4 metric cards** (`.ytd-grid` — grid `repeat(4, 1fr)`, gap `--gap`; 2 cols under 820px):
1. **Gross earnings** — neutral. Subtitle "incl. $X bonus" or "Salary only".
2. **Taxes withheld** — red. Subtitle "X% effective".
3. **Deductions** — blue. Subtitle "$X pre · $Y post".
4. **Employer-paid** — purple. Subtitle "$X benefits + taxes".

Each metric: 14px×16px padding, eyebrow label, 24/700 value (`-.02em`), 12px subtitle in `--text-2`. Color modifier (`.green/.red/.blue/.purple`) tints the value.

**Monthly bar chart** (`.ytd-chart`):
- Header strip: title "Monthly breakdown" + legend (Net green / Deductions blue / Taxes red, each a 8×8 2-radius square next to its label).
- Body: `grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6; min-height: 200; align-items: end;` — one column per stub.
- Each column:
  - Event dot (6×6 circle, color per event tone, `visibility:hidden` if no event) above the bar.
  - Stack (`.ytd-bar-stack`) height 150, column-reverse, gap 2, radius 6, `--surface-elev` track. Segments: **net (green)** at the bottom, then **deductions (blue)**, then **taxes (red)**, all heights are `(value / maxStubGross) * 100%`.
  - Month label below (10.5px / `--text-3`).
- Hover a column: other columns get `opacity: .3`. Tooltip card pops below the chart with the stub date, gross/net/deductions/taxes.
- Click a column: navigate to Single-stub view focused on that stub.

**Saved + invested / Tax detail / Employer detail / Events timeline** (additional cards below the chart):
- Same banner-card pattern as single stub, with LineRow primitives.
- Events timeline (`.ytd-events`) — each row is `.ytd-event`: grid `auto 1fr auto`, date column min-width 70, info (label + desc), and a 4×36 colored swatch on the right matching the event tone.

## Interactions & Behavior

### Navigation
- **Tabs:** clicking changes `activeTab` state, swaps the rendered view component.
- **Stub prev/next:** disabled at bounds. Clamped to `[0, STUBS.length-1]`.
- **All-stubs row click** and **YTD bar click** → jump to Single tab, set `stubIdx`.

### Donut hover
- `onMouseEnter` on each slice sets `hovered` state to that slice key.
- `onMouseLeave` on the SVG clears it.
- Non-hot slices fade (opacity 0.22), hot slice stroke-width 7.4 → 10 over 280ms with back ease.
- Center label/amount/percent swap to hot slice's data; tone color applied to the amount.
- Default (no hover): center shows "Gross pay" + gross + annual rate.

### YTD chart hover
- `onMouseEnter` on a column sets `hoverIdx`. Other columns dimmed to 0.3.
- Tooltip card appears below chart with stub details.
- `onMouseLeave` on chart body clears.

### Density / theme / wireframe (Tweaks panel)
- Theme switch: `[data-theme]` attribute on `<html>`. CSS variables swap; 200ms transition.
- Density: `[data-density]` swaps padding scale.
- Wireframe: `[data-wireframe="on"]` removes fills/colors from cards, banners, pills, footnote, donut slices — strokes-only / monochrome look.

### Privacy blur (used elsewhere)
- `[data-privacy="on"]` blurs balances; not currently bound to a control on this page but the styling pattern is the same as Accounts (`filter: blur(7px)`, unblur on hover).

## State Management
- `activeTab`: `"single" | "all" | "ytd"`
- `stubIdx`: integer 0…12 (which stub is currently displayed in Single view; computed stub derived via `useMemo(() => computeStub(STUBS[stubIdx]), [stubIdx])`)
- `theme`: `"light" | "dark"`
- `density`: `"compact" | "regular" | "comfy"`
- `wireframe`: boolean
- `donutSize`: 220–400, default 250
- `hovered` (in HeroCard): slice key or null
- `year` (in YTDView): 2025 | 2026
- `hoverIdx` (in YTDView chart): column index or null

No data fetching in the prototype — all state derived from `STUBS` constant in `payroll-data.jsx`.

## Data shape

```ts
type Stub = {
  id: number;
  date: string;            // "YYYY-MM-DD"
  period: string;          // "Apr 1 – Apr 30, 2026"
  voucher: string;         // "CBZ-26-004"
  salary: number;          // monthly base
  bonus: number;           // 0 if none
  rate: string;            // "$82,500 / yr"
  espp: number;            // post-tax deduction; 0 if not enrolled
  fit: number;             // federal income tax base (not incl. bonus supplemental)
  w4: "old" | "new";       // dependent claim
  deposits: { bank: string; last4: string; amount: number }[];
};

type ComputedStub = Stub & {
  gross: number;
  earnings: { salary; bonus; hours };
  deductions: {
    preTax: { k401, fsa, medical, dental, vision, subtotal };
    postTax: { espp, subtotal };
    total;
  };
  taxes: { fit, fica, med, state, total };
  net: number;
  employer: { k401Match, health, dental, ltd, gtli, fica, medicare, futa, suta, total };
  imputed: { ltd, gtli, total };
};
```

Computation rules (see `computeStub` in `payroll-data.jsx` — re-implement in the target codebase, ideally on the server):
- 401(k): 6% of salary
- FSA: $275/month flat
- Medical/dental/vision: $185 / $25 / $8 flat
- Bonus FIT: 22% supplemental
- FICA: 6.2% on min(taxable, $168,600/12)
- Medicare: 1.45% of taxable
- Ohio state: 3.2% of taxable
- Employer 401(k) match: 3% safe harbor
- Employer health/dental/LTD/GTLI/FUTA/SUTA: flat per month

Events (`EVENTS` constant): annotations on specific stubs — raise, bonus, W4 change, ESPP start. Used in All-stubs chips, YTD chart dots, and timeline.

## Assets
- No external image assets. All icons are inline SVG (theme toggle, prev/next chevrons, info "i" badge).
- System font stack only; no web fonts.

## Files in this bundle

| File | Purpose |
|---|---|
| `Income & Payroll.html` | Page shell, all CSS tokens + component styles, script tags |
| `payroll-data.jsx` | `STUBS` data, `EVENTS`, `computeStub()`, `computeYTD()`, formatters (`fmtMoney`, `fmtMoneyParts`, `fmtDate`, `fmtDateShort`, `fmtMonth`) |
| `payroll-views.jsx` | Shared `LineRow` + `SectionHd`, the full `YTDView`, and `AllStubsView` components |
| `payroll-app.jsx` | Root `App`, `Donut`, `HeroCard`, `EarningsCard`, `DeductionsCard`, `TaxesCard`, `EmployerCard`, `ImputedFootnote`, `SingleStubView` |
| `tweaks-panel.jsx` | Floating tweaks panel — **prototype-only**; remove in production. Drives theme/density/wireframe/donut-size/stub picker. |

## Notes for the implementer
- **Drop the Tweaks panel.** It's a prototype affordance for design review, not a user-facing control.
- **Donut math:** the dasharray/offset approach in `Donut` is solid for arbitrary slice counts; the only quirks are the `+ C/4 - acc` rotation to start at 12 o'clock and the `gap = 0.8` to visually separate slices. Replicate this rather than swapping in a chart library — it's smaller and matches the hover behavior exactly.
- **Number formatting:** all dollar amounts use `toLocaleString("en-US", { minimumFractionDigits: 2 })`. Cents in hero displays are visually de-emphasized (smaller, lighter color) via the `fmtMoneyParts()` split.
- **The compute layer should move to the server** in production — never recompute tax/withholding client-side in a shipping app. Use the prototype's math as a spec for the API response.
- **Accessibility:** add proper `aria-selected` to tabs, `aria-label` to icon-only buttons (already present in some places), and keyboard arrow-key navigation on the donut and bar chart slices.
- **Responsive:** the design assumes ≥820px for two-column layouts (deductions+taxes pair, YTD 4-card row, donut on the right of the hero). Below that, everything stacks. Mobile-specific designs are out of scope for this pass.
