'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; symbol: string; price: number; changePct: number | null }
  | { kind: 'fail' };

export function MarketDataSettings({ hasKey, keySource }: { hasKey: boolean; keySource: string }) {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketDataKey: key.trim() }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (json.error) setMsg(json.error.message ?? 'Could not save.');
    else { setMsg('Saved.'); setKey(''); setTest({ kind: 'idle' }); router.refresh(); }
  }

  async function clearKey() {
    setBusy(true);
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketDataKey: '' }) });
    setBusy(false);
    setTest({ kind: 'idle' });
    router.refresh();
  }

  async function runTest() {
    setTest({ kind: 'testing' });
    const res = await fetch('/api/market/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(key.trim() ? { key: key.trim() } : {}),
    });
    const json = await res.json().catch(() => ({}));
    const d = json?.data;
    if (d?.ok) setTest({ kind: 'ok', symbol: d.symbol, price: d.price, changePct: d.changePct });
    else setTest({ kind: 'fail' });
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-5 mt-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[15px] font-semibold">Market data</h2>
        <span className={`text-[11px] font-medium rounded px-2 py-0.5 ${hasKey ? 'bg-positive/15 text-positive' : 'bg-surface-2 text-text-tertiary border border-border-subtle'}`}>
          {hasKey ? `Configured${keySource === 'env' ? ' (env)' : ''}` : 'Not set'}
        </span>
      </div>
      <p className="text-[12.5px] text-text-tertiary mb-4">
        Live quotes and index benchmarks for the Investments page, via{' '}
        <a href="https://twelvedata.com" target="_blank" rel="noreferrer" className="text-accent-500 hover:underline">Twelve Data</a>{' '}
        (free tier works). The key is stored in your database (this deployment only); you can also set{' '}
        <code className="text-text-secondary">MARKET_DATA_KEY</code> in the environment. Without a key, Investments falls back to statement-reported values.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">Twelve Data API key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setTest({ kind: 'idle' }); }}
            placeholder={hasKey ? '•••••••• (set — type to replace)' : 'your API key'}
            className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-[13px] focus:outline-none focus:border-border-strong"
          />
        </label>
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 transition-colors">
          Save
        </button>
        <button type="button" onClick={runTest} disabled={test.kind === 'testing' || (!key.trim() && !hasKey)} className="rounded-lg border border-border-subtle hover:bg-surface-2 disabled:opacity-50 text-text-secondary text-[13px] font-medium px-4 py-2 transition-colors">
          {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {hasKey && keySource === 'settings' && (
          <button type="button" onClick={clearKey} disabled={busy} className="text-[12px] text-text-tertiary hover:text-negative transition-colors">
            Remove key
          </button>
        )}
        {msg && <span className="text-[12px] text-text-tertiary">{msg}</span>}
      </div>
      {test.kind === 'ok' && (
        <p className="text-[12px] text-positive mt-3">
          Connected — {test.symbol} {test.price.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
          {test.changePct != null && <span className="text-text-tertiary"> ({test.changePct >= 0 ? '+' : ''}{test.changePct.toFixed(2)}% today)</span>}
        </p>
      )}
      {test.kind === 'fail' && (
        <p className="text-[12px] text-negative mt-3">Couldn’t reach the provider with that key. Check the key and try again.</p>
      )}
    </section>
  );
}
