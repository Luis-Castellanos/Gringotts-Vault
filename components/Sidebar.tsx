'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_EVENT,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  readSidebarState,
  writeSidebarState,
  type SidebarState,
} from '@/lib/sidebar-state';
import { ThemeToggle } from './ThemeToggle';
import {
  IconAccounts,
  IconAudit,
  IconBell,
  IconCashflow,
  IconCategories,
  IconCreditCard,
  IconDashboard,
  IconFiles,
  IconForecasting,
  IconGoals,
  IconInvestments,
  IconNetWorth,
  IconPanelLeft,
  IconPayroll,
  IconRentals,
  IconReports,
  IconReview,
  IconSearch,
  IconSettings,
  IconTax,
  IconTransactions,
  IconTransfers,
  IconUpload,
} from './nav-icons';

type NavHref =
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

type NavItem = {
  href: NavHref;
  label: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
  showBadge?: boolean;
};
type NavGroup = { label: string; items: readonly NavItem[] };

const NAV_GROUPS: readonly NavGroup[] = [
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
  {
    label: 'Not started',
    items: [
      { href: '/tax', label: 'Tax', Icon: IconTax },
      { href: '/forecasting', label: 'Forecasting', Icon: IconForecasting },
    ],
  },
];

export function Sidebar({ reviewCount }: { reviewCount?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(true);
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  useEffect(() => {
    const initial = readSidebarState();
    setOpen(initial.open);
    setWidth(initial.width);
    function onState(e: Event) {
      const detail = (e as CustomEvent<SidebarState>).detail;
      if (!detail) return;
      setOpen(detail.open);
      setWidth(detail.width);
    }
    window.addEventListener(SIDEBAR_EVENT, onState);
    return () => window.removeEventListener(SIDEBAR_EVENT, onState);
  }, []);

  function onResizePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    let lastWidth = width;
    function onMove(ev: PointerEvent) {
      if (!draggingRef.current) return;
      const w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(ev.clientX)));
      lastWidth = w;
      setWidth(w);
    }
    function onUp() {
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      writeSidebarState({ width: lastWidth });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function collapseSidebar() {
    writeSidebarState({ open: false });
  }

  if (!open) return null;

  return (
    <aside
      className="sticky self-start flex flex-col bg-surface-1 border-r border-border-subtle"
      style={{ width, top: 44, height: 'calc(100vh - 44px)' }}
    >
      {/* Top: logo + action icons row (Monarch-style) */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <div className="size-8 rounded-lg bg-gradient-to-br from-positive to-emerald-600 flex items-center justify-center text-base font-bold shrink-0">
          ↙
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Search"
          title="Search (coming soon)"
        >
          <IconSearch />
        </button>
        <button
          type="button"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Notifications"
          title="Notifications (coming soon)"
        >
          <IconBell />
        </button>
        <Link
          href="/settings"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <IconSettings />
        </Link>
        <button
          type="button"
          onClick={collapseSidebar}
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <IconPanelLeft />
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex flex-col gap-3 px-2 pt-2 pb-3 overflow-y-auto flex-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-md text-[14px] transition-colors ${
                    active
                      ? 'bg-surface-3 text-text-primary font-medium'
                      : 'text-text-tertiary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.showBadge && reviewCount !== undefined && reviewCount > 0 && (
                    <span className="bg-accent-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums">
                      {reviewCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User chip + theme toggle */}
      <div className="flex items-center gap-3 px-3 py-3 border-t border-border-subtle">
        <div className="size-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-xs font-semibold shrink-0">
          AM
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">Alex Morgan</div>
          <div className="text-[11px] text-text-muted flex items-center gap-1.5 mt-0.5">
            <span className="size-1.5 rounded-full bg-positive" /> Synced
          </div>
        </div>
        <ThemeToggle className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors shrink-0" />
      </div>

      {/* Drag handle on the right edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={onResizePointerDown}
        className="absolute top-0 right-0 h-full w-1.5 cursor-ew-resize hover:bg-accent-500/30 transition-colors"
        title="Drag to resize"
      />
    </aside>
  );
}
