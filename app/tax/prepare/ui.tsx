'use client';

import { useEffect, useState } from 'react';

const parseNum = (s: string) => {
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/** Money input — local text state so decimals type smoothly; emits a number. */
export function MoneyInput({ value, onChange, placeholder = '0' }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if (parseNum(text) !== value) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative w-full">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-[12px] pointer-events-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={text}
        onChange={(e) => { setText(e.target.value); onChange(parseNum(e.target.value)); }}
        className="w-full rounded-lg bg-surface-2 border border-border-subtle pl-6 pr-2.5 py-1.5 text-[13px] text-text-primary tabular-nums text-right focus:outline-none focus:border-accent-500"
      />
    </div>
  );
}

export function IntInput({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={value || ''}
      placeholder="0"
      onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))}
      className="w-full rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[13px] text-text-primary tabular-nums text-right focus:outline-none focus:border-accent-500"
    />
  );
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:border-accent-500"
    />
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[12.5px] text-text-secondary"
    >
      <span className={`relative h-[18px] w-[32px] rounded-full transition-colors ${checked ? 'bg-accent-500' : 'bg-surface-3 border border-border-subtle'}`}>
        <span className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
      {label}
    </button>
  );
}

export function Panel({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border-subtle">
        <div>
          <h3 className="text-[13.5px] font-semibold">{title}</h3>
          {subtitle && <p className="text-[11.5px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A label + control row used throughout the deduction forms. */
export function FieldRow({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_160px] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <span className="text-[12.5px] text-text-secondary">{label}</span>
        {note && <span className="block text-[11px] text-text-muted">{note}</span>}
      </div>
      {children}
    </div>
  );
}
