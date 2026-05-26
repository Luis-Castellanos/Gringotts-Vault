'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { FilingStatus } from '@/lib/tax-engine';
import type { TaxFactsYear } from '@/lib/tax-engine';
import { PageHeader } from '@/components/PageHeader';
import { TaxTabs } from '../TaxTabs';

const FILING: { id: FilingStatus; short: string }[] = [
  { id: 'single', short: 'Single' },
  { id: 'mfj', short: 'MFJ' },
  { id: 'mfs', short: 'MFS' },
  { id: 'hoh', short: 'HOH' },
];

/** Segmented link/button strip used for the Summary↔Figures tabs and filing toggle. */
function Seg({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex rounded-lg bg-surface-2 border border-border-subtle p-0.5 text-[12.5px]">{children}</div>;
}

const usd0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function bracketRows(brs: { rate: number; upTo: number }[]) {
  let prev = 0;
  return brs.map((b) => {
    const row = { rate: b.rate, from: prev, to: b.upTo };
    prev = b.upTo;
    return row;
  });
}

export function FiguresClient({ data }: { data: TaxFactsYear }) {
  const router = useRouter();
  const [filing, setFiling] = useState<FilingStatus>('single');

  const yearSelect = (
    <select
      className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
      value={data.year}
      onChange={(e) => router.push(`/tax/figures?year=${e.target.value}`)}
      aria-label="Tax year"
    >
      {data.supported.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader
        title="Tax"
        subtitle={`Key federal figures · ${data.year} — verify against the linked IRS source`}
        actions={<><TaxTabs />{yearSelect}</>}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        {data.groups.map((g) => (
          <section key={g.title} className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden flex flex-col">
            <h2 className="text-[13.5px] font-semibold px-4 py-2.5 border-b border-border-subtle">{g.title}</h2>
            <div className="flex-1">
              {g.facts.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-3 px-4 py-1.5 border-b border-border-subtle/60 last:border-b-0">
                  <span className="text-[12.5px] text-text-secondary">
                    {f.label}
                    {f.note && <span className="block text-[11px] text-text-muted">{f.note}</span>}
                  </span>
                  <span className="text-[12.5px] font-medium tabular-nums text-text-primary whitespace-nowrap">{f.value}</span>
                </div>
              ))}
            </div>
            <a
              href={g.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-[11px] text-text-muted hover:text-accent-500 border-t border-border-subtle inline-flex items-center gap-1"
            >
              {g.source.label} <span aria-hidden>↗</span>
            </a>
          </section>
        ))}

        {/* Ordinary tax brackets — its own card with a filing-status toggle. */}
        <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden flex flex-col md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border-subtle">
            <h2 className="text-[13.5px] font-semibold">Ordinary tax brackets</h2>
            <Seg>
              {FILING.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFiling(f.id)}
                  className={`rounded-[7px] px-2 py-1 ${filing === f.id ? 'bg-surface-1 text-text-primary font-medium shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                >
                  {f.short}
                </button>
              ))}
            </Seg>
          </div>
          <div className="flex-1">
            {bracketRows(data.brackets[filing]).map((b) => (
              <div key={b.from} className="flex items-baseline justify-between gap-3 px-4 py-1.5 border-b border-border-subtle/60 last:border-b-0">
                <span className="text-[12.5px] font-medium tabular-nums text-text-primary w-12">{Math.round(b.rate * 100)}%</span>
                <span className="text-[12.5px] tabular-nums text-text-secondary whitespace-nowrap">
                  {usd0(b.from)} – {Number.isFinite(b.to) ? usd0(b.to) : <span>over {usd0(b.from)}</span>}
                </span>
              </div>
            ))}
          </div>
          <span className="px-4 py-2 text-[11px] text-text-muted border-t border-border-subtle">Taxable income, marginal rates</span>
        </section>
      </div>

      <p className="text-[11.5px] text-text-muted leading-relaxed">
        Inflation-adjusted figures for {data.year}. These are a quick reference, not tax advice — confirm each against the
        linked IRS / SSA source before relying on it. Figures shown for Single and MFJ are the most common; other statuses
        follow the same tables.
      </p>
    </>
  );
}
