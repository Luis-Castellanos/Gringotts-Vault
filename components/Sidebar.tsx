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
import { resolveSections } from './nav-config';
import { PROFILE_EVENT, type NavSection, type ProfileData } from '@/lib/profile/avatars';
import { IconPanelLeft, IconSettings } from './nav-icons';

const DragHandle = ({ className = '' }: { className?: string }) => (
  <svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden className={className}>
    <circle cx="3" cy="3" r="1.2" /><circle cx="8" cy="3" r="1.2" />
    <circle cx="3" cy="7" r="1.2" /><circle cx="8" cy="7" r="1.2" />
    <circle cx="3" cy="11" r="1.2" /><circle cx="8" cy="11" r="1.2" />
  </svg>
);

export function Sidebar({ reviewCount }: { reviewCount?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(true);
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const draggingRef = useRef(false);
  const dragItem = useRef<string | null>(null);
  const dragSection = useRef<string | null>(null);

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

  // Persist a new section layout (optimistic + broadcast so all listeners sync).
  function persistLayout(navLayout: NavSection[]) {
    setProfile((p) => (p ? { ...p, navLayout } : p));
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navLayout }),
    })
      .then((r) => r.json())
      .then((j) => { if (j?.data) window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: j.data as ProfileData })); })
      .catch(() => {});
  }
  const cloneLayout = () => (profile?.navLayout ?? []).map((s) => ({ ...s, items: [...s.items] }));
  const removeHref = (layout: NavSection[], href: string) => {
    for (const s of layout) { const i = s.items.indexOf(href); if (i >= 0) s.items.splice(i, 1); }
  };
  function dropOnItem(targetHref: string, sectionId: string) {
    const href = dragItem.current; dragItem.current = null; setDragging(null);
    if (!href || !profile || href === targetHref) return;
    const layout = cloneLayout();
    removeHref(layout, href);
    const target = layout.find((s) => s.id === sectionId);
    if (!target) return;
    const idx = target.items.indexOf(targetHref);
    target.items.splice(idx < 0 ? target.items.length : idx, 0, href);
    persistLayout(layout);
  }
  function dropOnSection(sectionId: string) {
    // Item dropped on a section header / body → append; section dropped → reorder.
    if (dragSection.current) {
      const sid = dragSection.current; dragSection.current = null; setDragging(null);
      if (!profile || sid === sectionId) return;
      const layout = cloneLayout();
      const from = layout.findIndex((s) => s.id === sid);
      const to = layout.findIndex((s) => s.id === sectionId);
      if (from < 0 || to < 0) return;
      const [moved] = layout.splice(from, 1);
      layout.splice(to, 0, moved!);
      persistLayout(layout);
      return;
    }
    const href = dragItem.current; dragItem.current = null; setDragging(null);
    if (!href || !profile) return;
    const layout = cloneLayout();
    removeHref(layout, href);
    const target = layout.find((s) => s.id === sectionId);
    if (!target) return;
    target.items.push(href);
    persistLayout(layout);
  }

  if (pathname === '/login') return null;
  if (!open) return null;

  const sections = resolveSections(profile?.navLayout ?? [], profile?.navHidden ?? []);

  return (
    <aside
      className="sticky self-start flex flex-col bg-surface-1 border-r border-border-subtle print:hidden"
      style={{ width, top: 44, height: 'calc(100vh - 44px)' }}
    >
      {/* Top: profile (avatar + name) + collapse */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2.5">
        <Link href="/settings" className="flex items-center gap-2.5 flex-1 min-w-0 group" title="Profile & settings">
          <Avatar
            name={profile?.name ?? ''}
            kind={profile?.avatarKind ?? 'gradient'}
            gradient={profile?.avatarGradient ?? 'monarch'}
            image={profile?.avatarImage ?? null}
            size={34}
            className="ring-1 ring-border-subtle"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold truncate group-hover:text-accent-300 transition-colors">{profile?.name?.trim() || 'Set your name'}</div>
            <div className="text-[11px] text-text-muted truncate">Owner</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={collapseSidebar}
          className="size-8 rounded-md flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors shrink-0"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <IconPanelLeft size={17} />
        </button>
      </div>

      {/* Nav — custom sections; drag the ⠿ handles to reorder pages or sections */}
      <nav className="flex flex-col gap-3 px-2 pt-2 pb-3 overflow-y-auto flex-1">
        {sections.map((section) => (
          <div
            key={section.id}
            className="flex flex-col gap-0.5 group/sec"
            onDragOver={(e) => { if (dragItem.current || dragSection.current) e.preventDefault(); }}
            onDrop={() => dropOnSection(section.id)}
          >
            <div
              draggable
              onDragStart={() => { dragSection.current = section.id; setDragging(`sec:${section.id}`); }}
              onDragEnd={() => { dragSection.current = null; setDragging(null); }}
              className={`flex items-center gap-1.5 px-3 pt-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-text-tertiary cursor-grab active:cursor-grabbing ${dragging === `sec:${section.id}` ? 'opacity-40' : ''}`}
              title="Drag to reorder section"
            >
              <DragHandle className="opacity-0 group-hover/sec:opacity-50 transition-opacity" />
              <span className="truncate">{section.label}</span>
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.Icon;
              return (
                <div
                  key={item.href}
                  className="relative group/row"
                  draggable
                  onDragStart={(e) => { dragItem.current = item.href; setDragging(item.href); e.stopPropagation(); }}
                  onDragEnd={() => { dragItem.current = null; setDragging(null); }}
                  onDragOver={(e) => { if (dragItem.current) e.preventDefault(); }}
                  onDrop={(e) => { e.stopPropagation(); dropOnItem(item.href, section.id); }}
                >
                  <Link
                    href={item.href}
                    className={`relative flex items-center justify-between gap-2 pl-3.5 pr-3 py-2.5 rounded-lg text-[15px] transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent-300 font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 font-medium'
                    } ${dragging === item.href ? 'opacity-40' : ''}`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-accent-500" />
                    )}
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon size={20} strokeWidth={active ? 2 : 1.8} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {item.showBadge && reviewCount !== undefined && reviewCount > 0 && (
                        <span className="bg-accent-500 text-white text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums">
                          {reviewCount}
                        </span>
                      )}
                      <DragHandle className="text-text-muted opacity-0 group-hover/row:opacity-60 cursor-grab active:cursor-grabbing transition-opacity" />
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom actions — spaced out to breathe */}
      <div className="flex items-center justify-around px-4 py-3.5 border-t border-border-subtle">
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="size-9 rounded-lg flex items-center justify-center text-text-tertiary hover:text-accent-300 hover:bg-surface-2 transition-colors"
        >
          <IconSettings size={18} />
        </Link>
        <ThemeToggle className="size-9 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors" />
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.href = '/login';
          }}
          aria-label="Sign out"
          title="Sign out"
          className="size-9 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
