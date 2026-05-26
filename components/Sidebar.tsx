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
import { Avatar } from './Avatar';
import { NAV_GROUPS } from './nav-config';
import { PROFILE_EVENT, type ProfileData } from '@/lib/profile/avatars';
import { IconBell, IconPanelLeft, IconSearch, IconSettings } from './nav-icons';

export function Sidebar({ reviewCount }: { reviewCount?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(true);
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [profile, setProfile] = useState<ProfileData | null>(null);
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

  // Profile (name + avatar + which pages to show) — fetched once, then kept
  // live via the event Settings dispatches on save (no reload needed).
  useEffect(() => {
    let alive = true;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.data) setProfile(j.data as ProfileData);
      })
      .catch(() => {});
    function onProfile(e: Event) {
      const detail = (e as CustomEvent<ProfileData>).detail;
      if (detail) setProfile(detail);
    }
    window.addEventListener(PROFILE_EVENT, onProfile);
    return () => {
      alive = false;
      window.removeEventListener(PROFILE_EVENT, onProfile);
    };
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

  if (pathname === '/login') return null;
  if (!open) return null;

  const hidden = new Set(profile?.navHidden ?? []);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(i.href)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <aside
      className="sticky self-start flex flex-col bg-surface-1 border-r border-border-subtle"
      style={{ width, top: 44, height: 'calc(100vh - 44px)' }}
    >
      {/* Top: logo + action icons row */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <div className="size-8 rounded-lg bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center text-base font-bold text-white shadow-sm shadow-accent-500/30 shrink-0">
          ↙
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-accent-300 hover:bg-surface-2 transition-colors"
          aria-label="Search"
          title="Search (coming soon)"
        >
          <IconSearch size={17} />
        </button>
        <button
          type="button"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-accent-300 hover:bg-surface-2 transition-colors"
          aria-label="Notifications"
          title="Notifications (coming soon)"
        >
          <IconBell size={17} />
        </button>
        <Link
          href="/settings"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-accent-300 hover:bg-surface-2 transition-colors"
          aria-label="Settings"
          title="Settings"
        >
          <IconSettings size={17} />
        </Link>
        <button
          type="button"
          onClick={collapseSidebar}
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <IconPanelLeft size={17} />
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex flex-col gap-3 px-2 pt-2 pb-3 overflow-y-auto flex-1">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="px-3 pt-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center justify-between gap-3 pl-3.5 pr-3 py-2.5 rounded-lg text-[15px] transition-colors ${
                    active
                      ? 'bg-accent-soft text-accent-300 font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 font-medium'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-accent-500" />
                  )}
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon size={20} strokeWidth={active ? 2 : 1.8} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.showBadge && reviewCount !== undefined && reviewCount > 0 && (
                    <span className="bg-accent-500 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums shrink-0">
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
      <div className="flex items-center gap-2.5 px-3 py-3 border-t border-border-subtle">
        <Link href="/settings" className="flex items-center gap-2.5 flex-1 min-w-0 group" title="Profile & settings">
          <Avatar
            name={profile?.name ?? ''}
            kind={profile?.avatarKind ?? 'gradient'}
            gradient={profile?.avatarGradient ?? 'monarch'}
            image={profile?.avatarImage ?? null}
            size={36}
            className="ring-1 ring-border-subtle"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate group-hover:text-accent-300 transition-colors">
              {profile?.name?.trim() || 'Set your name'}
            </div>
            <div className="text-[11px] text-text-muted truncate mt-0.5">Owner</div>
          </div>
        </Link>
        <ThemeToggle className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors shrink-0" />
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.href = '/login';
          }}
          aria-label="Sign out"
          title="Sign out"
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors shrink-0"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 15.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h3M12 12.5 15.5 9 12 5.5M15.5 9h-9" />
          </svg>
        </button>
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
