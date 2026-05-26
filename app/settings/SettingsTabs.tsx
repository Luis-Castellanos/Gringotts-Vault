'use client';

import { useEffect, useState } from 'react';

export type SettingsTab = { id: string; label: string; content: React.ReactNode };

const STORAGE_KEY = 'vault-settings-tab';

export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
  }, [tabs]);

  function select(id: string) {
    setActive(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border-subtle mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={`relative px-3.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                on ? 'text-accent-300' : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t.label}
              {on && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-accent-500" />}
            </button>
          );
        })}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
