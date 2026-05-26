'use client';

import { useEffect, useState } from 'react';

import { SCHEMES, SCHEME_STORAGE_KEY, DEFAULT_SCHEME, type Scheme } from '@/lib/theme';

export function AppearanceSettings() {
  const [scheme, setScheme] = useState<Scheme>(DEFAULT_SCHEME);

  useEffect(() => {
    const saved = (localStorage.getItem(SCHEME_STORAGE_KEY) as Scheme) || DEFAULT_SCHEME;
    setScheme(saved);
  }, []);

  function pick(s: Scheme) {
    setScheme(s);
    try { localStorage.setItem(SCHEME_STORAGE_KEY, s); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-scheme', s);
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-8">
      <h2 className="text-[15px] font-semibold mb-1">Color scheme</h2>
      <p className="text-[12.5px] text-text-tertiary mb-4">Sets the app’s accent color. Works with both light and dark mode (toggle in the sidebar).</p>
      <div className="flex flex-wrap gap-3">
        {SCHEMES.map((s) => {
          const on = scheme === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors ${on ? 'border-accent-500 bg-accent-soft' : 'border-border-subtle hover:bg-surface-2'}`}
            >
              <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: s.swatch }} />
              <span className="text-[13px] font-medium">{s.label}</span>
              {on && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l5 5L20 6" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
