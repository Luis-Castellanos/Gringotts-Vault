'use client';

import { useRef, useState } from 'react';

import { ALL_NAV_ITEMS, type NavItem } from '@/components/nav-config';
import { PROFILE_EVENT, type ProfileData } from '@/lib/profile/avatars';

const BY_HREF = new Map<string, NavItem>(ALL_NAV_ITEMS.map((i) => [i.href, i]));

/** Full nav list in `order`, with any missing items appended (incl. hidden ones). */
function orderedAll(order: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of order) if (BY_HREF.has(h) && !seen.has(h)) { out.push(h); seen.add(h); }
  for (const it of ALL_NAV_ITEMS) if (!seen.has(it.href)) out.push(it.href);
  return out;
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      className={`size-[18px] rounded-[5px] flex items-center justify-center border transition-colors shrink-0 ${
        on ? 'border-accent-500 bg-accent-500' : 'border-border-strong bg-transparent'
      }`}
    >
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12l5 5L20 6" />
        </svg>
      )}
    </span>
  );
}

export function SidebarSettings({ initialHidden, initialOrder }: { initialHidden: string[]; initialOrder: string[] }) {
  const [order, setOrder] = useState<string[]>(() => orderedAll(initialOrder));
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragHref = useRef<string | null>(null);

  const shown = (href: string) => !hidden.has(href);

  function toggle(href: string) {
    setMsg(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function drop(targetHref: string) {
    const from = dragHref.current;
    dragHref.current = null;
    setDragging(null);
    if (!from || from === targetHref) return;
    setMsg(null);
    setOrder((prev) => {
      const next = prev.filter((h) => h !== from);
      const idx = next.indexOf(targetHref);
      next.splice(idx < 0 ? next.length : idx, 0, from);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navHidden: [...hidden], navOrder: order }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (json.error) setMsg(json.error.message ?? 'Could not save.');
    else {
      setMsg('Saved.');
      if (json.data) window.dispatchEvent(new CustomEvent(PROFILE_EVENT, { detail: json.data as ProfileData }));
    }
  }

  const hiddenCount = hidden.size;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold">Sidebar pages</h2>
        <span className="text-[11px] text-text-tertiary">{hiddenCount > 0 ? `${hiddenCount} hidden` : 'All shown'}</span>
      </div>
      <p className="text-[12.5px] text-text-tertiary mb-4">
        Drag <span className="text-text-secondary">⋮⋮</span> to reorder the sidebar. Click a row to show/hide it (hidden pages still exist at their URL).
      </p>

      <div className="max-w-[440px] rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {order.map((href) => {
          const item = BY_HREF.get(href);
          if (!item) return null;
          const Icon = item.Icon;
          const on = shown(href);
          return (
            <div
              key={href}
              draggable
              onDragStart={() => { dragHref.current = href; setDragging(href); }}
              onDragEnd={() => { dragHref.current = null; setDragging(null); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(href)}
              className={`flex items-center gap-2.5 px-3 py-2 ${dragging === href ? 'opacity-40' : ''}`}
            >
              <span className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text-secondary select-none leading-none" title="Drag to reorder">⋮⋮</span>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(href)}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
              >
                <CheckBox on={on} />
                <Icon size={16} className={on ? 'text-text-secondary' : 'text-text-muted'} />
                <span className={`text-[13px] truncate ${on ? 'text-text-primary' : 'text-text-muted line-through'}`}>{item.label}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
          {busy ? 'Saving…' : 'Save sidebar'}
        </button>
        {msg && <span className="text-[12px] text-positive">{msg}</span>}
      </div>
    </section>
  );
}
