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
import { IconDashboard, IconPanelLeft, IconSettings } from './nav-icons';

const DragHandle = ({ className = '' }: { className?: string }) => (
  <svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden className={className}>
    <circle cx="3" cy="3" r="1.2" /><circle cx="8" cy="3" r="1.2" />
    <circle cx="3" cy="7" r="1.2" /><circle cx="8" cy="7" r="1.2" />
    <circle cx="3" cy="11" r="1.2" /><circle cx="8" cy="11" r="1.2" />
  </svg>
);

type DropTarget =
  | { kind: 'item'; href: string; sectionId: string; position: 'before' | 'after' }
  | { kind: 'section'; sectionId: string; position: 'before' | 'after' }
  | { kind: 'section-end'; sectionId: string };

const DropMarker = ({ position }: { position: 'before' | 'after' }) => (
  <span
    className={`pointer-events-none absolute left-3 right-3 z-10 h-[3px] rounded-full bg-[rgba(224,228,230,0.86)] shadow-[0_0_0_1px_rgba(255,255,255,0.28),0_3px_10px_rgba(0,0,0,0.18)] ${
      position === 'before' ? '-top-1' : '-bottom-1'
    }`}
    aria-hidden
  />
);

export function Sidebar({
  reviewCount,
  initialProfile,
}: {
  reviewCount?: number;
  initialProfile?: ProfileData | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean>(true);
  const [width, setWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [profile, setProfile] = useState<ProfileData | null>(initialProfile ?? null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
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
    if (!initialProfile) {
      fetch('/api/profile')
        .then((r) => r.json())
        .then((j) => {
          if (alive && j?.data) setProfile(j.data as ProfileData);
        })
        .catch(() => {});
    }
    function onProfile(e: Event) {
      const detail = (e as CustomEvent<ProfileData>).detail;
      if (detail) setProfile(detail);
    }
    window.addEventListener(PROFILE_EVENT, onProfile);
    return () => {
      alive = false;
      window.removeEventListener(PROFILE_EVENT, onProfile);
    };
  }, [initialProfile]);

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
  function expandSidebar() {
    writeSidebarState({ open: true });
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
  function clearDragState() {
    dragItem.current = null;
    dragSection.current = null;
    setDragging(null);
    setDropTarget(null);
  }
  function dropOnItem(targetHref: string, sectionId: string, position: 'before' | 'after') {
    const href = dragItem.current;
    clearDragState();
    if (!href || !profile || href === targetHref) return;
    const layout = cloneLayout();
    removeHref(layout, href);
    const target = layout.find((s) => s.id === sectionId);
    if (!target) return;
    const idx = target.items.indexOf(targetHref);
    const insertAt = idx < 0 ? target.items.length : idx + (position === 'after' ? 1 : 0);
    target.items.splice(insertAt, 0, href);
    persistLayout(layout);
  }
  function dropSectionOnSection(targetSectionId: string, position: 'before' | 'after') {
    const sid = dragSection.current;
    clearDragState();
    if (!profile || !sid || sid === targetSectionId) return;
    const layout = cloneLayout();
    const from = layout.findIndex((s) => s.id === sid);
    const to = layout.findIndex((s) => s.id === targetSectionId);
    if (from < 0 || to < 0) return;
    const [moved] = layout.splice(from, 1);
    const adjustedTo = from < to ? to - 1 : to;
    layout.splice(adjustedTo + (position === 'after' ? 1 : 0), 0, moved!);
    persistLayout(layout);
  }
  function dropOnSectionEnd(sectionId: string) {
    // Item dropped on a section header / body → append; section dropped → reorder.
    if (dragSection.current) {
      dropSectionOnSection(sectionId, 'after');
      return;
    }
    const href = dragItem.current;
    clearDragState();
    if (!href || !profile) return;
    const layout = cloneLayout();
    removeHref(layout, href);
    const target = layout.find((s) => s.id === sectionId);
    if (!target) return;
    target.items.push(href);
    persistLayout(layout);
  }
  function dragPosition(e: React.DragEvent): 'before' | 'after' {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2 ? 'after' : 'before';
  }
  function onItemDragOver(e: React.DragEvent, href: string, sectionId: string) {
    if (!dragItem.current || dragItem.current === href) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ kind: 'item', href, sectionId, position: dragPosition(e) });
  }
  function onSectionDragOver(e: React.DragEvent, sectionId: string) {
    if (!dragSection.current || dragSection.current === sectionId) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ kind: 'section', sectionId, position: dragPosition(e) });
  }
  function onSectionBodyDragOver(e: React.DragEvent, sectionId: string) {
    if (!dragItem.current && !dragSection.current) return;
    e.preventDefault();
    setDropTarget({ kind: 'section-end', sectionId });
  }

  if (pathname === '/login') return null;

  const sections = resolveSections(profile?.navLayout ?? [], profile?.navHidden ?? []);

  if (!open) {
    return (
      <aside
        className="vault-rail-shell sticky self-start flex w-[82px] flex-col items-center px-3 py-3 print:hidden"
        style={{ top: 44, height: 'calc(100vh - 44px)' }}
      >
        <div className="vault-icon-rail flex h-full w-[56px] flex-col overflow-hidden rounded-[28px]">
        <div className="flex flex-col items-center gap-2 px-2 pt-3 pb-2.5">
          <Link href="/settings" title="Profile & settings" aria-label="Profile & settings" className="vault-rail-logo flex size-10 items-center justify-center rounded-2xl">
            <Avatar
              name={profile?.name ?? ''}
              kind={profile?.avatarKind ?? 'gradient'}
              gradient={profile?.avatarGradient ?? 'monarch'}
              image={profile?.avatarImage ?? null}
              size={32}
              className="ring-0"
            />
          </Link>
          <Link
            href="/"
            className={`vault-rail-button relative flex size-10 shrink-0 items-center justify-center rounded-2xl ${pathname === '/' ? 'active' : ''}`}
            aria-label="Dashboard"
            title="Dashboard"
          >
            <IconDashboard size={17} />
          </Link>
          <button
            type="button"
            onClick={expandSidebar}
            className="vault-rail-button flex size-10 shrink-0 items-center justify-center rounded-2xl"
            aria-label="Show sidebar"
            title="Show sidebar"
          >
            <IconPanelLeft size={17} className="rotate-180" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3 pt-1">
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex flex-col items-center gap-1 border-t border-white/12 pt-2 first:border-t-0 first:pt-0"
            >
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={`vault-rail-button relative flex size-10 items-center justify-center rounded-2xl ${active ? 'active' : ''}`}
                  >
                    <Icon size={20} strokeWidth={active ? 2 : 1.8} />
                    {item.showBadge && reviewCount !== undefined && reviewCount > 0 && (
                      <span className="absolute right-0 top-0 min-w-4 rounded-full bg-white px-1 text-center text-[9.5px] font-semibold leading-4 tabular-nums text-[var(--rail-mid)]">
                        {reviewCount > 9 ? '9+' : reviewCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2 border-t border-white/12 px-2 py-3">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="vault-rail-button flex size-10 items-center justify-center rounded-2xl"
          >
            <IconSettings size={18} />
          </Link>
          <ThemeToggle className="vault-rail-button flex size-10 items-center justify-center rounded-2xl" />
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
              window.location.href = '/login';
            }}
            aria-label="Sign out"
            title="Sign out"
            className="vault-rail-button flex size-10 items-center justify-center rounded-2xl"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 15.5H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h3M12 12.5 15.5 9 12 5.5M15.5 9h-9" />
            </svg>
          </button>
        </div>
        </div>
      </aside>
    );
  }

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
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold tracking-[0] transition-colors group-hover:text-accent-500">{profile?.name?.trim() || 'Set your name'}</div>
            <div className="ui-caption truncate">Owner</div>
          </div>
        </Link>
        <Link
          href="/"
          className={`ui-icon-button size-8 shrink-0 rounded-md ${pathname === '/' ? 'bg-accent-soft text-accent-500' : ''}`}
          aria-label="Dashboard"
          title="Dashboard"
        >
          <IconDashboard size={17} />
        </Link>
        <button
          type="button"
          onClick={collapseSidebar}
          className="ui-icon-button size-8 shrink-0 rounded-md"
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
            className={`relative flex flex-col gap-0.5 rounded-xl transition-[background,box-shadow,padding] group/sec ${
              dropTarget?.kind === 'section-end' && dropTarget.sectionId === section.id
                ? 'bg-[rgba(224,228,230,0.1)] pb-1 shadow-[inset_0_0_0_1px_rgba(224,228,230,0.2)]'
                : ''
            }`}
            onDragOver={(e) => onSectionBodyDragOver(e, section.id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
            }}
            onDrop={(e) => { e.preventDefault(); dropOnSectionEnd(section.id); }}
          >
            <div
              draggable
              onDragStart={(e) => {
                dragSection.current = section.id;
                setDragging(`sec:${section.id}`);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', section.id);
              }}
              onDragOver={(e) => onSectionDragOver(e, section.id)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropTarget?.kind === 'section' && dropTarget.sectionId === section.id) {
                  dropSectionOnSection(section.id, dropTarget.position);
                }
              }}
              onDragEnd={clearDragState}
              className={`ui-label relative flex cursor-grab items-center gap-1.5 rounded-lg px-3 pb-1.5 pt-2 transition-[background,opacity,transform,margin] active:cursor-grabbing ${
                dragging === `sec:${section.id}` ? 'opacity-40' : ''
              } ${
                dropTarget?.kind === 'section' && dropTarget.sectionId === section.id
                  ? `bg-[rgba(224,228,230,0.12)] ${dropTarget.position === 'before' ? 'mt-2' : 'mb-2'}`
                  : ''
              }`}
              title="Drag to reorder section"
            >
              {dropTarget?.kind === 'section' && dropTarget.sectionId === section.id && (
                <DropMarker position={dropTarget.position} />
              )}
              <DragHandle className="opacity-0 group-hover/sec:opacity-50 transition-opacity" />
              <span className="truncate">{section.label}</span>
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.Icon;
              return (
                <div
                  key={item.href}
                  className={`relative rounded-lg transition-[background,transform,padding,margin] group/row ${
                    dropTarget?.kind === 'item' && dropTarget.href === item.href
                      ? `bg-[rgba(224,228,230,0.12)] ${dropTarget.position === 'before' ? 'mt-2' : 'mb-2'}`
                      : ''
                  }`}
                  draggable
                  onDragStart={(e) => {
                    dragItem.current = item.href;
                    setDragging(item.href);
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.href);
                  }}
                  onDragEnd={clearDragState}
                  onDragOver={(e) => onItemDragOver(e, item.href, section.id)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dropTarget?.kind === 'item' && dropTarget.href === item.href) {
                      dropOnItem(item.href, section.id, dropTarget.position);
                    }
                  }}
                >
                  {dropTarget?.kind === 'item' && dropTarget.href === item.href && (
                    <DropMarker position={dropTarget.position} />
                  )}
                  <Link
                    href={item.href}
                    draggable={false}
                    className={`relative flex items-center justify-between gap-2 rounded-lg py-2.5 pl-3.5 pr-3 text-[14px] font-medium tracking-[0] transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent-500 font-semibold'
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
                        <span className="rounded-md bg-accent-500 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-[var(--color-accent-contrast)]">
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
          className="ui-icon-button"
        >
          <IconSettings size={18} />
        </Link>
        <ThemeToggle className="ui-icon-button" />
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.href = '/login';
          }}
          aria-label="Sign out"
          title="Sign out"
          className="ui-icon-button"
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
