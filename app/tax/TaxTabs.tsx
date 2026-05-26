'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/tax', label: 'Snapshot' },
  { href: '/tax/prepare', label: 'Prepare' },
  { href: '/tax/plan', label: 'Plan' },
  { href: '/tax/figures', label: 'Key figures' },
];

/** Shared Tax-area tab strip (Snapshot · Prepare · Key figures). */
export function TaxTabs() {
  const path = usePathname();
  return (
    <div className="inline-flex rounded-lg bg-surface-2 border border-border-subtle p-0.5 text-[12.5px]">
      {TABS.map((t) => {
        const active = t.href === '/tax' ? path === '/tax' : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-[7px] px-3 py-1 ${active ? 'bg-surface-1 text-text-primary font-medium shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
