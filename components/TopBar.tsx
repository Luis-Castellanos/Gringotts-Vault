'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  SIDEBAR_EVENT,
  readSidebarState,
  writeSidebarState,
  type SidebarState,
} from '@/lib/sidebar-state';

export function TopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    setOpen(readSidebarState().open);
    function onState(e: Event) {
      const detail = (e as CustomEvent<SidebarState>).detail;
      if (detail) setOpen(detail.open);
    }
    window.addEventListener(SIDEBAR_EVENT, onState);
    return () => window.removeEventListener(SIDEBAR_EVENT, onState);
  }, []);

  function toggle() {
    writeSidebarState({ open: !open });
  }

  if (pathname === '/login') return null;

  return (
    <div className="app-topbar sticky top-0 z-50 flex h-11 items-center gap-3 border-b px-4 print:hidden">
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
        title={open ? 'Hide sidebar' : 'Show sidebar'}
        className="ui-icon-button"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" />
        </svg>
      </button>
      <span className="app-brand text-[13.5px] font-semibold tracking-[0]">Vault</span>
    </div>
  );
}
