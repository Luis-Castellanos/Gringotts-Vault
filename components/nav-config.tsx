/**
 * The sidebar's page list — shared between the Sidebar (which renders it) and
 * Settings → Sidebar (which toggles per-page visibility). Kept here, not in
 * Sidebar.tsx, so both can import the same source of truth (href + label + icon).
 */

import {
  IconAccounts,
  IconAudit,
  IconCashflow,
  IconCategories,
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
  {
    label: 'Manage',
    items: [
      { href: '/accounts', label: 'Accounts', Icon: IconAccounts },
      { href: '/categories', label: 'Categories', Icon: IconCategories },
    ],
  },
];

/** Every nav href in display order — handy for validating stored visibility prefs. */
export const ALL_NAV_HREFS: readonly NavHref[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
