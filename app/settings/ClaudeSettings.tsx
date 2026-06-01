'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ClaudeSettings({ hasKey, keySource, model }: { hasKey: boolean; keySource: string; model: string }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [m, setM] = useState(model);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { model: m };
    if (key.trim()) body.anthropicApiKey = key.trim();
    const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (json.error) setMsg(json.error.message ?? 'Could not save.');
    else { setMsg('Saved.'); setKey(''); router.refresh(); }
  }
  async function clearKey() {
    setBusy(true);
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anthropicApiKey: '' }) });
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mt-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold">Claude categorization</h2>
        <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${hasKey ? 'bg-positive/15 text-positive' : 'bg-surface-2 text-text-tertiary border border-border-subtle'}`}>
          {hasKey ? `Configured${keySource === 'env' ? ' (env)' : ''}` : 'Not set'}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Anthropic API key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? '•••••••• (set — type to replace)' : 'sk-ant-…'}
            className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </label>
        <label className="flex flex-col gap-1.5 w-[240px]">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Model</span>
          <input
            value={m}
            onChange={(e) => setM(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </label>
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
          Save
        </button>
        {hasKey && keySource === 'settings' && (
          <button type="button" onClick={clearKey} disabled={busy} className="text-[12px] text-text-tertiary hover:text-negative transition-colors">
            Remove key
          </button>
        )}
        {msg && <span className="text-[12px] text-text-tertiary">{msg}</span>}
      </div>
    </section>
  );
}
