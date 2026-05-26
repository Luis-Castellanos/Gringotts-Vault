'use client';

import { useState } from 'react';

import { DOCUMENT_SCHEMAS, DOCUMENT_ORDER, aggregateDocuments, type TaxWorkspace, type TaxDocumentType, type TaxDocument } from '@/lib/tax-engine';
import { fmtMoney0 } from '@/lib/format';
import { MoneyInput, TextInput, Toggle, Select } from './ui';

const GROUPS: { key: 'income' | 'investment' | 'business' | 'deduction'; label: string }[] = [
  { key: 'income', label: 'Income' },
  { key: 'investment', label: 'Investments' },
  { key: 'business', label: 'Business & rental' },
  { key: 'deduction', label: 'Deductions' },
];

export function DocumentsSection({ ws, update }: { ws: TaxWorkspace; update: (mut: (d: TaxWorkspace) => void) => void }) {
  const [picking, setPicking] = useState(false);

  const addDoc = (type: TaxDocumentType) => {
    const schema = DOCUMENT_SCHEMAS[type];
    const fields: Record<string, number> = {};
    for (const f of schema.fields) fields[f.key] = 0;
    const options: Record<string, string | boolean> = {};
    for (const o of schema.options ?? []) options[o.key] = o.default ?? (o.kind === 'toggle' ? false : '');
    const doc: TaxDocument = { id: crypto.randomUUID(), type, fields, options: schema.options ? options : undefined };
    update((d) => { d.documents.push(doc); });
    setPicking(false);
  };

  const agg = aggregateDocuments(ws.documents);
  const scheduleCNet = agg.scheduleC.reduce((s, c) => s + c.netProfit, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Flow-through summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Chip label="Wages" value={agg.wages} />
        <Chip label="Interest + dividends" value={agg.taxableInterest + agg.ordinaryDividends} />
        <Chip label="Business (Sch C)" value={scheduleCNet} />
        <Chip label="Withholding" value={agg.fedWithholding} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-text-tertiary">{ws.documents.length} document{ws.documents.length === 1 ? '' : 's'} — values flow into the return automatically.</p>
        <button
          onClick={() => setPicking((p) => !p)}
          className="rounded-lg bg-accent-500 text-white text-[12.5px] font-medium px-3 py-1.5 hover:bg-accent-600"
        >
          {picking ? 'Close' : '+ Add document'}
        </button>
      </div>

      {/* Picker */}
      {picking && (
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-4 flex flex-col gap-4">
          {GROUPS.map((g) => {
            const types = DOCUMENT_ORDER.filter((t) => DOCUMENT_SCHEMAS[t].group === g.key);
            return (
              <div key={g.key}>
                <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-2">{g.label}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {types.map((t) => {
                    const s = DOCUMENT_SCHEMAS[t];
                    return (
                      <button
                        key={t}
                        onClick={() => addDoc(t)}
                        className="text-left rounded-lg border border-border-subtle bg-surface-2 hover:border-accent-500 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[15px]">{s.icon}</span>
                          <span className="text-[12.5px] font-medium text-text-primary">{s.short}</span>
                        </div>
                        <p className="text-[11px] text-text-muted mt-1 leading-snug">{s.blurb}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document cards */}
      {ws.documents.length === 0 && !picking && (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-14 text-center text-[13px] text-text-tertiary">
          No documents yet. Add your W-2, 1099s, K-1s, 1098s, or a Schedule C/E — each one&apos;s figures flow into the return.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ws.documents.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} update={update} />
        ))}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-1 border border-border-subtle px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums text-text-primary mt-0.5">{fmtMoney0(value)}</div>
    </div>
  );
}

function DocumentCard({ doc, update }: { doc: TaxDocument; update: (mut: (d: TaxWorkspace) => void) => void }) {
  const schema = DOCUMENT_SCHEMAS[doc.type];
  const setField = (key: string, n: number) => update((d) => { const x = d.documents.find((q) => q.id === doc.id); if (x) x.fields[key] = n; });
  const setOption = (key: string, v: string | boolean) => update((d) => { const x = d.documents.find((q) => q.id === doc.id); if (x) { x.options = { ...(x.options ?? {}), [key]: v }; } });
  const setLabel = (v: string) => update((d) => { const x = d.documents.find((q) => q.id === doc.id); if (x) x.label = v; });
  const remove = () => update((d) => { d.documents = d.documents.filter((q) => q.id !== doc.id); });

  const net = schema.net?.(doc.fields);

  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[16px]">{schema.icon}</span>
          <span className="text-[13px] font-semibold truncate">{schema.title}</span>
        </div>
        <button onClick={remove} className="text-[11px] text-text-muted hover:text-negative shrink-0">Remove</button>
      </div>
      <div className="p-4 flex flex-col gap-2">
        <input
          type="text"
          value={doc.label ?? ''}
          placeholder="Payer / employer name (optional)"
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[12.5px] text-text-secondary focus:outline-none focus:border-accent-500 mb-1"
        />
        {schema.fields.map((f) => (
          <div key={f.key} className="grid grid-cols-[1fr_150px] items-center gap-3">
            <div className="min-w-0">
              <span className="text-[12px] text-text-secondary">{f.label}</span>
              {f.note && <span className="block text-[10.5px] text-text-muted">{f.note}</span>}
            </div>
            <MoneyInput value={doc.fields[f.key] ?? 0} onChange={(n) => setField(f.key, n)} />
          </div>
        ))}
        {(schema.options ?? []).map((o) => (
          <div key={o.key} className="pt-1">
            {o.kind === 'toggle' ? (
              <Toggle checked={doc.options?.[o.key] === true} onChange={(b) => setOption(o.key, b)} label={o.label} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-text-secondary">{o.label}</span>
                <Select value={(doc.options?.[o.key] as string) ?? o.choices?.[0]?.value ?? ''} onChange={(v) => setOption(o.key, v)} options={o.choices ?? []} />
              </div>
            )}
          </div>
        ))}
        {net && (
          <div className="flex items-center justify-between border-t border-border-subtle pt-2 mt-1">
            <span className="text-[12px] font-medium text-text-secondary">{net.label}</span>
            <span className={`text-[13px] font-semibold tabular-nums ${net.amount < 0 ? 'text-negative' : 'text-text-primary'}`}>{fmtMoney0(net.amount)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
