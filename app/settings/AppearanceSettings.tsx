'use client';

import { useEffect, useState } from 'react';

import {
  DEFAULT_RAIL,
  DEFAULT_SCHEME,
  RAIL_COLORS,
  RAIL_STORAGE_KEY,
  SCHEMES,
  SCHEME_STORAGE_KEY,
  type RailColor,
  type Scheme,
} from '@/lib/theme';

export function AppearanceSettings() {
  const [scheme, setScheme] = useState<Scheme>(DEFAULT_SCHEME);
  const [rail, setRail] = useState<RailColor>(DEFAULT_RAIL);

  useEffect(() => {
    const saved = (localStorage.getItem(SCHEME_STORAGE_KEY) as Scheme) || DEFAULT_SCHEME;
    const savedRail = (localStorage.getItem(RAIL_STORAGE_KEY) as RailColor) || DEFAULT_RAIL;
    setScheme(saved);
    setRail(savedRail);
  }, []);

  function pick(s: Scheme) {
    setScheme(s);
    try { localStorage.setItem(SCHEME_STORAGE_KEY, s); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-scheme', s);
  }

  function pickRail(r: RailColor) {
    setRail(r);
    try { localStorage.setItem(RAIL_STORAGE_KEY, r); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-rail', r);
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-8">
      <div className="grid gap-6">
        <div>
          <h2 className="text-[15px] font-semibold mb-3">Color scheme</h2>
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
        </div>
        <div>
          <h2 className="text-[15px] font-semibold mb-3">Icon rail color</h2>
          <div className="flex flex-wrap gap-3">
            {RAIL_COLORS.map((r) => {
              const on = rail === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRail(r.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors ${on ? 'border-accent-500 bg-accent-soft' : 'border-border-subtle hover:bg-surface-2'}`}
                >
                  <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: r.swatch }} />
                  <span className="text-[13px] font-medium">{r.label}</span>
                  {on && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-300)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
