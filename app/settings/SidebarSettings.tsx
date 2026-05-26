'use client';

import { useState } from 'react';

import { ITEM_BY_HREF, normalizeSections } from '@/components/nav-config';
import { PROFILE_EVENT, type NavSection, type ProfileData } from '@/lib/profile/avatars';
import { Select } from '@/components/Select';

export function SidebarSettings({ initialLayout, initialHidden }: { initialLayout: NavSection[]; initialHidden: string[] }) {
  const [layout, setLayout] = useState<NavSection[]>(() => normalizeSections(initialLayout));
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = () => setMsg(null);
  const shown = (h: string) => !hidden.has(h);
  const toggleVis = (h: string) => { dirty(); setHidden((prev) => { const n = new Set(prev); if (n.has(h)) n.delete(h); else n.add(h); return n; }); };
  const rename = (id: string, label: string) => { dirty(); setLayout((ls) => ls.map((s) => (s.id === id ? { ...s, label } : s))); };
  const addSection = () => { dirty(); setLayout((ls) => [...ls, { id: `sec-${Date.now()}`, label: 'New section', items: [] }]); };
  const deleteSection = (id: string) => {
    dirty();
    setLayout((ls) => (ls.length <= 1 ? ls : normalizeSections(ls.filter((s) => s.id !== id))));
  };
  const moveTo = (href: string, toId: string) => {
    dirty();
    setLayout((ls) => ls.map((s) => ({
      ...s,
      items: s.id === toId ? (s.items.includes(href) ? s.items : [...s.items, href]) : s.items.filter((h) => h !== href),
    })));
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
      <p className="text-[12.5px] text-text-tertiary mb-4">
        Organize the sidebar into your own sections. Rename a heading, move a page to another section, or hide it.
        You can also <span className="text-text-secondary">drag the ⠿ handles directly in the sidebar</span> to reorder pages and sections.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {layout.map((section) => (
          <div key={section.id} className="rounded-lg border border-border-subtle bg-surface-base">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
              <input
                value={section.label}
                onChange={(e) => rename(section.id, e.target.value)}
                placeholder="Section name"
                maxLength={40}
                className="flex-1 bg-transparent text-[12px] font-semibold uppercase tracking-[0.07em] text-text-secondary focus:outline-none focus:text-text-primary"
              />
              <button
                type="button"
                onClick={() => deleteSection(section.id)}
                disabled={layout.length <= 1}
                title={layout.length <= 1 ? 'Keep at least one section' : 'Delete section (its pages move to the last section)'}
                className="text-text-muted hover:text-negative disabled:opacity-30 disabled:hover:text-text-muted transition-colors text-[15px] leading-none"
                aria-label={`Delete ${section.label}`}
              >
                ×
              </button>
            </div>
            <div className="flex flex-col py-1">
              {section.items.length === 0 && <div className="px-3 py-2 text-[12px] text-text-muted">No pages — move some here.</div>}
              {section.items.map((href) => {
                const item = ITEM_BY_HREF.get(href);
                if (!item) return null;
                const Icon = item.Icon;
                const on = shown(href);
                return (
                  <div key={href} className="flex items-center gap-2.5 px-3 py-1.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleVis(href)}
                      className={`size-[18px] rounded-[5px] flex items-center justify-center border shrink-0 transition-colors ${on ? 'border-accent-500 bg-accent-500' : 'border-border-strong bg-transparent'}`}
                      title={on ? 'Visible — click to hide' : 'Hidden — click to show'}
                    >
                      {on && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12l5 5L20 6" />
                        </svg>
                      )}
                    </button>
                    <Icon size={16} className={on ? 'text-text-secondary' : 'text-text-muted'} />
                    <span className={`text-[13px] flex-1 min-w-0 truncate ${on ? 'text-text-primary' : 'text-text-muted line-through'}`}>{item.label}</span>
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
