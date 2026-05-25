'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { MortgageAccountOption, Portfolio, PropertyRow } from '@/lib/properties/load';
import { PropertyForm, propertyTypeLabel } from './PropertyForm';
import { addressLine, equityPct, fmtMoney0, fmtPct, specLine } from './format';

function HouseImage({ url, alt, className = '' }: { url: string | null; alt: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-surface-3 to-surface-2 ${className}`}>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-text-muted" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5L12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1.5">{label}</div>
      <div className="text-[24px] font-semibold tracking-[-0.01em] tabular-nums">{value}</div>
      {sub && <div className="text-[12px] text-text-tertiary mt-1">{sub}</div>}
    </section>
  );
}

function PropertyCard({ p }: { p: PropertyRow }) {
  const value = p.marketValue ?? p.acquisitionPrice ?? 0;
  const ePct = equityPct(p);
  const ePctClamped = ePct == null ? 0 : Math.max(0, Math.min(100, ePct));
  return (
    <Link
      href={`/rentals/${p.id}`}
      className="group flex flex-col rounded-2xl bg-surface-1 border border-border-subtle overflow-hidden hover:border-border-strong transition-colors"
    >
      <div className="relative">
        <HouseImage url={p.imageUrl} alt={p.name} className="h-44 w-full" />
        <span className="absolute top-3 left-3 rounded-md bg-black/55 backdrop-blur px-2 py-1 text-[11px] font-medium text-white/90">
          {propertyTypeLabel(p.propertyType)}
        </span>
        {!p.isActive && (
          <span className="absolute top-3 right-3 rounded-md bg-black/55 backdrop-blur px-2 py-1 text-[11px] font-medium text-white/90">
            Sold
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div>
          <div className="text-[15px] font-semibold text-text-primary truncate">{p.name}</div>
          <div className="text-[12.5px] text-text-tertiary truncate">
            {addressLine(p) || '—'}
            {specLine(p) && <span> · {specLine(p)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Value</div>
            <div className="text-[14px] font-semibold tabular-nums">{fmtMoney0(value)}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Loan</div>
            <div className="text-[14px] font-semibold tabular-nums text-negative">{p.loanBalance > 0 ? fmtMoney0(p.loanBalance) : '$0'}</div>
          </div>
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted">Equity</div>
            <div className="text-[14px] font-semibold tabular-nums text-positive">{fmtMoney0(p.equity)}</div>
          </div>
        </div>

        <div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-positive" style={{ width: `${ePctClamped}%` }} />
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {ePct != null ? `${fmtPct(ePct)} equity` : 'Add value + mortgage to see equity'}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function RealEstateClient({
  portfolio,
  mortgageOptions,
}: {
  portfolio: Portfolio;
  mortgageOptions: MortgageAccountOption[];
}) {
  const [adding, setAdding] = useState(false);
  const { properties, count, totalMarketValue, totalEquity, totalLoanBalance } = portfolio;

  return (
    <>
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Real Estate</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">
            Your properties, their mortgages, and the equity you&rsquo;ve built.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90"
        >
          + Add property
        </button>
      </div>

      {count > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Tile label="Portfolio value" value={fmtMoney0(totalMarketValue)} sub={`${count} propert${count === 1 ? 'y' : 'ies'}`} />
          <Tile label="Total equity" value={fmtMoney0(totalEquity)} sub={totalMarketValue > 0 ? `${fmtPct((totalEquity / totalMarketValue) * 100)} of value` : undefined} />
          <Tile label="Loan balance" value={fmtMoney0(totalLoanBalance)} sub="Across linked mortgages" />
          <Tile label="Avg. equity" value={fmtMoney0(count > 0 ? totalEquity / count : 0)} sub="Per property" />
        </div>
      )}

      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold mb-1">No properties yet</h2>
          <p className="text-[13px] text-text-tertiary max-w-md mx-auto mb-5">
            Add a property to track its value, link its mortgage, and see the amortization schedule.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90"
          >
            + Add your first property
          </button>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {properties.map((p) => (
            <PropertyCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {adding && <PropertyForm mortgageOptions={mortgageOptions} onClose={() => setAdding(false)} />}
    </>
  );
}
