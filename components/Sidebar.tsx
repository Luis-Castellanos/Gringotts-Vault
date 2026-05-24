'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

type NavItem = {
  href: '/' | '/accounts' | '/credit-cards' | '/transactions' | '/review' | '/cashflow' | '/net-worth' | '/reports';
  label: string;
  icon: string;
  showBadge?: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Dashboard', icon: '⌂' },
  { href: '/accounts', label: 'Accounts', icon: '▭' },
  { href: '/credit-cards', label: 'Credit Cards', icon: '▤' },
  { href: '/transactions', label: 'Transactions', icon: '≡' },
  { href: '/review', label: 'Review', icon: '✓', showBadge: true },
  { href: '/cashflow', label: 'Cashflow', icon: '↗' },
  { href: '/net-worth', label: 'Net Worth', icon: '⤳' },
  { href: '/reports', label: 'Reports', icon: '▦' },
];

export function Sidebar({ reviewCount }: { reviewCount?: number }) {
  const pathname = usePathname();

  return (
    // Width bumped 220 → 260 to match the bigger main column
    <aside className="flex flex-col bg-surface-1 border-r border-border-subtle p-5 w-[260px]">
      {/* Logo — bigger mark, bigger wordmark */}
      <div className="flex items-center gap-3 px-3 py-2 mb-8">
        <div className="size-9 rounded-lg bg-gradient-to-br from-positive to-emerald-600 flex items-center justify-center text-lg font-bold">
          ↙
        </div>
        <div className="font-semibold text-lg -tracking-[0.01em]">Vault</div>
      </div>

      {/* Nav items — bigger padding, bigger text, bigger icon column */}
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-[15px] transition-colors ${
                active
                  ? 'bg-surface-3 text-text-primary font-medium'
                  : 'text-text-tertiary hover:bg-surface-2'
              }`}
            >
              <span className="flex items-center gap-3.5">
                <span className="w-5 inline-block text-center text-base">{item.icon}</span>
                <span>{item.label}</span>
              </span>
              {item.showBadge && reviewCount !== undefined && reviewCount > 0 && (
                <span className="bg-accent-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {reviewCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User chip + theme toggle */}
      <div className="mt-auto flex items-center gap-3 px-3 py-2.5">
        <div className="size-9 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-sm font-semibold">
          AM
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Alex Morgan</div>
          <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
            <span className="size-1.5 rounded-full bg-positive" /> Synced
          </div>
        </div>
        <ThemeToggle className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors" />
      </div>
    </aside>
  );
}