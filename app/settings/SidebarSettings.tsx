'use client';

import { useState } from 'react';

import { ITEM_BY_HREF, normalizeSections } from '@/components/nav-config';
import { PROFILE_EVENT, type NavSection, type ProfileData } from '@/lib/profile/avatars';
import { Select } from '@/components/Select';

type DragState =
  | { kind: 'section'; sectionId: string }
  | { kind: 'page'; href: string; sectionId: string };

type DropTarget =
  | { kind: 'section'; sectionId: string; position: 'before' | 'after' }
  | { kind: 'page'; href: string; sectionId: string; position: 'before' | 'after' }
  | { kind: 'section-body'; sectionId: string };

const MoveIcon = ({ direction }: { direction: 'up' | 'down' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {direction === 'up' ? <path d="M3.5 8.5 7 5l3.5 3.5" /> : <path d="M3.5 5.5 7 9l3.5-3.5" />}
  </svg>
);

const DragGrip = ({ className = '' }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden className={className}>
    <circle cx="5" cy="3" r="1.1" /><circle cx="9" cy="3" r="1.1" />
    <circle cx="5" cy="7" r="1.1" /><circle cx="9" cy="7" r="1.1" />
    <circle cx="5" cy="11" r="1.1" /><circle cx="9" cy="11" r="1.1" />
  </svg>
);

const DropLine = ({ position }: { position: 'before' | 'after' }) => (
  <span
    aria-hidden
    className={`pointer-events-none absolute left-3 right-3 z-10 h-[3px] rounded-full bg-[rgba(224,228,230,0.86)] shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_3px_10px_rgba(0,0,0,0.18)] ${
      position === 'before' ? '-top-1' : '-bottom-1'
    }`}
  />
);

export function SidebarSettings({ initialLayout, initialHidden }: { initialLayout: NavSection[]; initialHidden: string[] }) {
  const [layout, setLayout] = useState<NavSection[]>(() => normalizeSections(initialLayout));
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const dirty = () => setMsg(null);
  const shown = (h: string) => !hidden.has(h);
  const toggleVis = (h: string) => { dirty(); setHidden((prev) => { const n = new Set(prev); if (n.has(h)) n.delete(h); else n.add(h); return n; }); };
  const rename = (id: string, label: string) => { dirty(); setLayout((ls) => ls.map((s) => (s.id === id ? { ...s, label } : s))); };
  const addSection = () => { dirty(); setLayout((ls) => [...ls, { id: `sec-${Date.now()}`, label: 'New section', items: [] }]); };
  const moveSection = (id: string, delta: -1 | 1) => {
    dirty();
    setLayout((ls) => {
      const from = ls.findIndex((s) => s.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ls.length) return ls;
      const next = [...ls];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };
  const deleteSection = (id: string) => {
    dirty();
    setLayout((ls) => (ls.length <= 1 ? ls : normalizeSections(ls.filter((s) => s.id !== id))));
  };
  const movePage = (sectionId: string, href: string, delta: -1 | 1) => {
    dirty();
    setLayout((ls) => ls.map((s) => {
      if (s.id !== sectionId) return s;
      const from = s.items.indexOf(href);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= s.items.length) return s;
      const items = [...s.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved!);
      return { ...s, items };
    }));
  };
  const moveTo = (href: string, toId: string) => {
    dirty();
    setLayout((ls) => ls.map((s) => ({
      ...s,
      items: s.id === toId ? (s.items.includes(href) ? s.items : [...s.items, href]) : s.items.filter((h) => h !== href),
    })));
  };
  const clearDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };
  const dragPosition = (e: React.DragEvent): 'before' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
  };
  const reorderSection = (sourceId: string, targetId: string, position: 'before' | 'after') => {
    if (sourceId === targetId) return;
    dirty();
    setLayout((ls) => {
      const from = ls.findIndex((s) => s.id === sourceId);
      const to = ls.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return ls;
      const next = [...ls];
      const [moved] = next.splice(from, 1);
      let insertAt = to;
      if (from < to) insertAt -= 1;
      if (position === 'after') insertAt += 1;
      next.splice(insertAt, 0, moved!);
      return next;
    });
  };
  const dropPage = (href: string, toSectionId: string, targetHref?: string, position: 'before' | 'after' = 'after') => {
    if (href === targetHref) return;
    dirty();
    setLayout((ls) => {
      const next = ls.map((s) => ({ ...s, items: s.items.filter((h) => h !== href) }));
      const target = next.find((s) => s.id === toSectionId);
      if (!target) return ls;
      const targetIndex = targetHref ? target.items.indexOf(targetHref) : -1;
      const insertAt = targetIndex < 0 ? target.items.length : targetIndex + (position === 'after' ? 1 : 0);
      target.items.splice(insertAt, 0, href);
      return next;
    });
  };
  const onSectionDragOver = (e: React.DragEvent, sectionId: string) => {
    if (!dragging) return;
    if (dragging.kind === 'section') {
      if (dragging.sectionId === sectionId) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget({ kind: 'section', sectionId, position: dragPosition(e) });
      return;
    }
    if (layout.find((s) => s.id === sectionId)?.items.length === 0) {
      e.preventDefault();
      setDropTarget({ kind: 'section-body', sectionId });
    }
  };
  const onPageDragOver = (e: React.DragEvent, href: string, sectionId: string) => {
    if (!dragging || dragging.kind !== 'page' || dragging.href === href) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ kind: 'page', href, sectionId, position: dragPosition(e) });
  };
  const onDropSection = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = dropTarget;
    const source = dragging;
    clearDrag();
    if (!source || !target) return;
    if (source.kind === 'section' && target.kind === 'section') reorderSection(source.sectionId, target.sectionId, target.position);
    if (source.kind === 'page' && target.kind === 'section-body' && target.sectionId === sectionId) dropPage(source.href, sectionId);
  };
  const onDropPage = (e: React.DragEvent, href: string, sectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const target = dropTarget;
    const source = dragging;
    clearDrag();
    if (source?.kind === 'page' && target?.kind === 'page' && target.href === href) {
      dropPage(source.href, sectionId, href, target.position);
    }
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navLayout: layout, navHidden: [...hidden] }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (json.error) setMsg(json.error.message ?? 'Could not save.');
    else {
      setMsg('Saved.');
      if (json.data) {
        const data = json.data as ProfileData;
        setLayout(normalizeSections(data.navLayout));
        window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: data }));
      }
    }
  }

  const sectionOptions = layout.map((s) => ({ value: s.id, label: s.label || 'Untitled' }));
  const hiddenCount = hidden.size;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold">Sidebar sections</h2>
        <span className="text-[11px] text-text-tertiary">{hiddenCount > 0 ? `${hiddenCount} hidden` : 'All shown'}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {layout.map((section, sectionIndex) => (
          <div
            key={section.id}
            draggable
            onDragStart={(e) => {
              if ((e.target as HTMLElement).closest('input,button,[role="button"],.vsel')) {
                e.preventDefault();
                return;
              }
              setDragging({ kind: 'section', sectionId: section.id });
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', section.id);
            }}
            onDragOver={(e) => onSectionDragOver(e, section.id)}
            onDrop={(e) => onDropSection(e, section.id)}
            onDragEnd={clearDrag}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
            }}
            className={`relative rounded-lg border border-border-subtle bg-surface-base transition-[background,opacity,transform,box-shadow,margin] ${
              dragging?.kind === 'section' && dragging.sectionId === section.id ? 'opacity-45' : ''
            } ${
              dropTarget?.kind === 'section' && dropTarget.sectionId === section.id
                ? `bg-[rgba(224,228,230,0.08)] ${dropTarget.position === 'before' ? 'mt-2' : 'mb-2'}`
                : dropTarget?.kind === 'section-body' && dropTarget.sectionId === section.id
                  ? 'bg-[rgba(224,228,230,0.08)] shadow-[inset_0_0_0_1px_rgba(224,228,230,0.22)]'
                  : ''
            }`}
          >
            {dropTarget?.kind === 'section' && dropTarget.sectionId === section.id && <DropLine position={dropTarget.position} />}
            <div
              className="flex cursor-grab items-center gap-2 px-3 py-2 border-b border-border-subtle active:cursor-grabbing"
              title="Drag to reorder section"
            >
              <DragGrip className="shrink-0 text-text-muted opacity-70" />
              <input
                value={section.label}
                onChange={(e) => rename(section.id, e.target.value)}
                placeholder="Section name"
                maxLength={40}
                className="flex-1 bg-transparent text-[12px] font-semibold uppercase tracking-[0.07em] text-text-secondary focus:outline-none focus:text-text-primary"
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveSection(section.id, -1)}
                  disabled={sectionIndex === 0}
                  title="Move section up"
                  className="ui-icon-button size-7 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                  draggable={false}
                  aria-label={`Move ${section.label} section up`}
                >
                  <MoveIcon direction="up" />
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(section.id, 1)}
                  disabled={sectionIndex === layout.length - 1}
                  title="Move section down"
                  className="ui-icon-button size-7 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                  draggable={false}
                  aria-label={`Move ${section.label} section down`}
                >
                  <MoveIcon direction="down" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => deleteSection(section.id)}
                disabled={layout.length <= 1}
                title={layout.length <= 1 ? 'Keep at least one section' : 'Delete section (its pages move to the last section)'}
                className="text-text-muted hover:text-negative disabled:opacity-30 disabled:hover:text-text-muted transition-colors text-[15px] leading-none"
                draggable={false}
                aria-label={`Delete ${section.label}`}
              >
                ×
              </button>
            </div>
            <div className="flex flex-col py-1">
              {section.items.length === 0 && <div className="px-3 py-2 text-[12px] text-text-muted">No pages — move some here.</div>}
              {section.items.map((href, itemIndex) => {
                const item = ITEM_BY_HREF.get(href);
                if (!item) return null;
                const Icon = item.Icon;
                const on = shown(href);
                return (
                  <div
                    key={href}
                    draggable
                    onDragStart={(e) => {
                      if ((e.target as HTMLElement).closest('button,.vsel')) {
                        e.preventDefault();
                        return;
                      }
                      setDragging({ kind: 'page', href, sectionId: section.id });
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', href);
                    }}
                    onDragOver={(e) => onPageDragOver(e, href, section.id)}
                    onDrop={(e) => onDropPage(e, href, section.id)}
                    onDragEnd={clearDrag}
                    className={`relative flex cursor-grab items-center gap-2.5 px-3 py-1.5 rounded-lg transition-[background,opacity,margin] active:cursor-grabbing ${
                      dragging?.kind === 'page' && dragging.href === href ? 'opacity-45' : ''
                    } ${
                      dropTarget?.kind === 'page' && dropTarget.href === href
                        ? `bg-[rgba(224,228,230,0.1)] ${dropTarget.position === 'before' ? 'mt-2' : 'mb-2'}`
                        : ''
                    }`}
                  >
                    {dropTarget?.kind === 'page' && dropTarget.href === href && <DropLine position={dropTarget.position} />}
                    <DragGrip className="shrink-0 text-text-muted opacity-60" />
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleVis(href)}
                      className={`size-[18px] rounded-[5px] flex items-center justify-center border shrink-0 transition-colors ${on ? 'border-accent-500 bg-accent-500' : 'border-border-strong bg-transparent'}`}
                      title={on ? 'Visible — click to hide' : 'Hidden — click to show'}
                      draggable={false}
                    >
                      {on && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12l5 5L20 6" />
                        </svg>
                      )}
                    </button>
                    <Icon size={16} className={on ? 'text-text-secondary' : 'text-text-muted'} />
                    <span className={`text-[13px] flex-1 min-w-0 truncate ${on ? 'text-text-primary' : 'text-text-muted line-through'}`}>{item.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => movePage(section.id, href, -1)}
                        disabled={itemIndex === 0}
                        title="Move page up"
                        className="ui-icon-button size-7 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                        draggable={false}
                        aria-label={`Move ${item.label} up`}
                      >
                        <MoveIcon direction="up" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePage(section.id, href, 1)}
                        disabled={itemIndex === section.items.length - 1}
                        title="Move page down"
                        className="ui-icon-button size-7 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                        draggable={false}
                        aria-label={`Move ${item.label} down`}
                      >
                        <MoveIcon direction="down" />
                      </button>
                    </div>
                    <Select
                      value={section.id}
                      onChange={(v) => moveTo(href, v)}
                      options={sectionOptions}
                      className="vsel-sm shrink-0"
                      ariaLabel={`Move ${item.label} to section`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="button" onClick={addSection} className="rounded-lg border border-border-subtle hover:bg-surface-2 text-text-secondary text-[13px] font-medium px-3.5 py-2 transition-colors">
          + Add section
        </button>
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
          {busy ? 'Saving…' : 'Save sidebar'}
        </button>
        {msg && <span className="text-[12px] text-positive">{msg}</span>}
      </div>
    </section>
  );
}
