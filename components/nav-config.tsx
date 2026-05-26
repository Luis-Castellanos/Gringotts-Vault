/**
 * The sidebar's page list — shared between the Sidebar (which renders it) and
 * Settings → Sidebar (which toggles per-page visibility). Kept here, not in
 * Sidebar.tsx, so both can import the same source of truth (href + label + icon).
 */

import type { NavSection } from '@/lib/profile/avatars';
import {
  IconAudit,
  IconCashflow,
  IconCreditCard,
  IconDashboard,
  IconFiles,
  IconForecasting,
  IconGoals,
  IconInvestments,
  IconNetWorth,
  IconPayroll,
  IconRentals,
  IconReports,
  IconReview,
  IconTax,
  IconTransactions,
  IconTransfers,
  IconUpload,
} from './nav-icons';

export type NavHref =
  | '/'
  | '/accounts'
  | '/credit-cards'
  | '/payroll'
  | '/transactions'
  | '/review'
  | '/cashflow'
  | '/net-worth'
  | '/reports'
  | '/rentals'
  | '/investments'
  | '/tax'
  | '/forecasting'
  | '/categories'
  | '/upload'
  | '/files'
  | '/audit'
  | '/transfers'
  | '/goals';

export type NavItem = {
  href: NavHref;
  label: string;
  Icon: (props: { size?: number; className?: string; strokeWidth?: number }) => React.ReactElement;
  showBadge?: boolean;
};
export type NavGroup = { label: string; items: readonly NavItem[] };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Complete',
    items: [
      { href: '/review', label: 'Review', Icon: IconReview, showBadge: true },
      { href: '/transactions', label: 'Transactions', Icon: IconTransactions },
      { href: '/payroll', label: 'Payroll', Icon: IconPayroll },
      { href: '/credit-cards', label: 'Credit Cards', Icon: IconCreditCard },
    ],
  },
  {
    label: 'Under development',
    items: [
      { href: '/', label: 'Dashboard', Icon: IconDashboard },
      { href: '/net-worth', label: 'Net Worth', Icon: IconNetWorth },
      { href: '/cashflow', label: 'Cashflow', Icon: IconCashflow },
      { href: '/reports', label: 'Reports', Icon: IconReports },
      { href: '/transfers', label: 'Transfers', Icon: IconTransfers },
      { href: '/rentals', label: 'Real Estate', Icon: IconRentals },
      { href: '/investments', label: 'Investments', Icon: IconInvestments },
      { href: '/goals', label: 'Goals', Icon: IconGoals },
      { href: '/forecasting', label: 'Forecasting', Icon: IconForecasting },
      { href: '/tax', label: 'Tax', Icon: IconTax },
    ],
  },
  {
    label: 'Data',
    items: [
      { href: '/upload', label: 'Upload', Icon: IconUpload },
      { href: '/files', label: 'Files', Icon: IconFiles },
      { href: '/audit', label: 'Statement Audit', Icon: IconAudit },
    ],
  },
];

/** Every nav item, flattened in default display order (groups are presentational only now). */
export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Every nav href in default display order — used to validate stored prefs. */
export const ALL_NAV_HREFS: readonly NavHref[] = ALL_NAV_ITEMS.map((i) => i.href);

export const ITEM_BY_HREF = new Map<string, NavItem>(ALL_NAV_ITEMS.map((i) => [i.href, i]));

/** Sensible starting sections (replaces the old dev-status grouping). */
export const DEFAULT_SECTIONS: NavSection[] = [
  { id: 'spending', label: 'Spending', items: ['/review', '/transactions', '/payroll', '/credit-cards'] },
  { id: 'insights', label: 'Insights', items: ['/', '/net-worth', '/cashflow', '/reports'] },
  { id: 'planning', label: 'Planning', items: ['/goals', '/forecasting', '/tax', '/rentals', '/investments', '/transfers'] },
  { id: 'data', label: 'Data', items: ['/upload', '/files', '/audit'] },
];

/**
 * Normalize a (possibly partial/stale) layout into a complete, valid one: drop
 * unknown/duplicate hrefs, keep only real sections, and ensure every nav page is
 * placed exactly once — any missing pages (new routes) are appended to the last
 * section. Empty input falls back to DEFAULT_SECTIONS.
 */
export function normalizeSections(raw: NavSection[] | null | undefined): NavSection[] {
  const source = raw && raw.length ? raw : DEFAULT_SECTIONS;
  const placed = new Set<string>();
  let sections: NavSection[] = source
    .filter((s) => s && typeof s.label === 'string')
    .map((s, i) => {
      const items = (Array.isArray(s.items) ? s.items : []).filter((h) => ITEM_BY_HREF.has(h) && !placed.has(h));
      items.forEach((h) => placed.add(h));
      return { id: s.id || `sec-${i}`, label: s.label, items };
    });
  if (sections.length === 0) sections = [{ id: 'main', label: 'Menu', items: [] }];
  const missing = ALL_NAV_ITEMS.map((i) => i.href).filter((h) => !placed.has(h));
  if (missing.length) sections[sections.length - 1]!.items.push(...missing);
  return sections;
}

/** For rendering: sections with resolved NavItems, hidden pages removed, empties dropped. */
export function resolveSections(
  layout: NavSection[],
  navHidden: readonly string[],
): { id: string; label: string; items: NavItem[] }[] {
  const hidden = new Set(navHidden);
  return normalizeSections(layout)
    .map((s) => ({
      id: s.id,
      label: s.label,
      items: s.items.map((h) => ITEM_BY_HREF.get(h)).filter((it): it is NavItem => !!it && !hidden.has(it.href)),
    }))
    .filter((s) => s.items.length > 0);
}
