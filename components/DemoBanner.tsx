'use client';

import { useState } from 'react';

import { DEMO_MODE } from '@/lib/demo/mode';

/**
 * Floating "live demo" pill (demo deployment only). Sample data, and a button to
 * reseed it. Fixed-position so it never shifts the page layout.
 */
export function DemoBanner() {
  const [resetting, setResetting] = useState(false);

  if (!DEMO_MODE) return null;

  const reset = async () => {
    if (resetting) return;
    if (!confirm('Reset the demo back to its sample data? Any changes made here will be discarded.')) return;
    setResetting(true);
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      window.location.reload();
    } catch {
      setResetting(false);
    }
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-surface-1/95 backdrop-blur border border-border-subtle shadow-lg px-4 py-2">
      <span className="text-[12px] text-text-secondary">
        <span className="font-semibold text-accent-500">Live demo</span> · sample data, not real
      </span>
      <button
        onClick={reset}
        disabled={resetting}
        className="rounded-full bg-surface-2 border border-border-subtle px-2.5 py-1 text-[11.5px] font-medium text-text-secondary hover:border-accent-500 disabled:opacity-50"
      >
        {resetting ? 'Resetting…' : 'Reset demo data'}
      </button>
    </div>
  );
}
