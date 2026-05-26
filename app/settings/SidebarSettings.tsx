'use client';

import { useState } from 'react';

import { NAV_GROUPS } from '@/components/nav-config';
import { PROFILE_EVENT, type ProfileData } from '@/lib/profile/avatars';

type TriState = 'on' | 'off' | 'mixed';

/** Presentational tri-state box; the wrapping <button> carries the interaction. */
function TriBox({ state }: { state: TriState }) {
  return (
    <span
      className={`size-[18px] rounded-[5px] flex items-center justify-center border transition-colors shrink-0 ${
        state === 'off' ? 'border-border-strong bg-transparent' : 'border-accent-500 bg-accent-500'
      }`}
    >
      {state === 'on' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12l5 5L20 6" />
        </svg>
      )}
      {state === 'mixed' && <span className="w-2.5 h-0.5 rounded bg-white" />}
    </span>
  );
}

export function SidebarSettings({ initialHidden }: { initialHidden: string[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = (href: string) => !hidden.has(href);

  function togglePage(href: string) {
    setMsg(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  function groupState(hrefs: string[]): TriState {
    const visible = hrefs.filter(shown).length;
    if (visible === 0) return 'off';
    if (visible === hrefs.length) return 'on';
    return 'mixed';
  }

  function toggleGroup(hrefs: string[]) {
    setMsg(null);
    const allShown = hrefs.every(shown);
    setHidden((prev) => {
      const next = new Set(prev);
      // If everything's shown, hide the group; otherwise reveal all of it.
      for (const h of hrefs) (allShown ? next.add(h) : next.delete(h));
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navHidden: [...hidden] }),
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
        Hide pages you don’t use. They disappear from the sidebar (the pages still exist at their URL). Toggle a whole section with its header.
      </p>

      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
        {NAV_GROUPS.map((group) => {
          const hrefs = group.items.map((i) => i.href);
          const gState = groupState(hrefs);
          return (
            <div key={group.label}>
              <button
                type="button"
                role="checkbox"
                aria-checked={gState === 'mixed' ? 'mixed' : gState === 'on'}
                onClick={() => toggleGroup(hrefs)}
                className="flex items-center gap-2.5 pb-2 mb-1 w-full border-b border-border-subtle"
              >
                <TriBox state={gState} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">{group.label}</span>
              </button>
              <div className="flex flex-col">
                {group.items.map((item) => {
                  const Icon = item.Icon;
                  const on = shown(item.href);
                  return (
                    <button
                      key={item.href}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => togglePage(item.href)}
                      className="flex items-center gap-2.5 py-1.5 text-left"
                    >
                      <TriBox state={on ? 'on' : 'off'} />
                      <Icon size={16} className={on ? 'text-text-secondary' : 'text-text-muted'} />
                      <span className={`text-[13px] ${on ? 'text-text-primary' : 'text-text-muted line-through'}`}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
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
