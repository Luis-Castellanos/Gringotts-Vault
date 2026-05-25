'use client';

import Link from 'next/link';

import type { Holdings, InvAccount, InvestmentsData, ValuePoint } from '@/lib/investments/load';
import { accountTypeLabel } from '@/lib/account-types';
import { assetClassLabel } from '@/lib/investments/asset-class';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0, fmtMoney, fmtSigned0 as moneySigned } from '@/lib/format';

const PALETTE = ['var(--color-cat-blue)', 'var(--color-cat-purple)', 'var(--color-cat-cyan)', 'var(--color-cat-emerald)', 'var(--color-cat-amber)', 'var(--color-cat-pink)'];

function AreaChart({ series, height = 220 }: { series: ValuePoint[]; height?: number }) {
  if (series.length < 2) return <div style={{ height }} className="flex items-center justify-center text-[13px] text-text-muted">Not enough history to chart yet.</div>;
  const W = 1000;
  const H = height;
  const vals = series.map((p) => p.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = series.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 8 - ((v - min) / range) * (H - 16);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id="inv-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-positive)" stopOpacity="0.20" />
          <stop offset="100%" stopColor="var(--color-positive)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#inv-area)" />
      <path d={line} fill="none" stroke="var(--color-positive)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="w-20 h-7" />;
  const W = 80;
  const H = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 4)}`).join(' ');
  return (
    <svg width={W} height={H} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AccountRow({ a, color }: { a: InvAccount; color: string }) {
  const up = a.sparkline.length >= 2 && a.sparkline[a.sparkline.length - 1]! >= a.sparkline[0]!;
  return (
    <Link href={`/accounts/${a.id}`} className="flex items-center gap-4 px-3 py-3 -mx-3 rounded-lg hover:bg-surface-2 transition-colors">
      <span className="size-2.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-text-primary truncate">{a.name}</div>
        <div className="text-[12px] text-text-tertiary">{a.subtype || accountTypeLabel(a.type)} · {a.share}%</div>
      </div>
      <MiniSpark data={a.sparkline} color={up ? 'var(--color-positive)' : 'var(--color-negative)'} />
      <div className="text-[15px] font-semibold tabular-nums text-text-primary w-28 text-right">{money0(a.balance)}</div>
    </Link>
  );
}

const ALLOC_PALETTE = ['var(--color-cat-blue)', 'var(--color-cat-purple)', 'var(--color-cat-emerald)', 'var(--color-cat-amber)', 'var(--color-cat-cyan)', 'var(--color-cat-pink)'];

function HoldingsSection({ holdings }: { holdings: Holdings }) {
  const { rows, totalValue, totalCost, totalGain, allocation, anyLive } = holdings;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : null;
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold">Holdings</h2>
        <span className="text-[11.5px] text-text-muted">{anyLive ? 'Live prices' : 'Statement values'}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <StatTile size="lg" label="Market value" value={money0(totalValue)} />
        <StatTile size="lg" label="Cost basis" value={totalCost > 0 ? money0(totalCost) : '—'} />
        <StatTile size="lg" label="Total gain" value={totalCost > 0 ? moneySigned(totalGain) : '—'} tone={totalGain >= 0 ? 'pos' : 'neg'} sub={gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        {/* Positions */}
        <div className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 text-[10.5px] uppercase tracking-[0.06em] text-text-muted border-b border-border-subtle">
            <span>Holding</span>
            <span className="text-right">Value</span>
            <span className="text-right w-20">Gain</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {rows.map((h) => (
              <div key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-text-primary truncate">
                    {h.symbol ? <span className="tabular-nums">{h.symbol}</span> : h.name}
                    {h.symbol && <span className="text-text-tertiary font-normal"> · {h.name}</span>}
                  </div>
                  <div className="text-[11.5px] text-text-tertiary tabular-nums">
                    {h.quantity != null ? `${h.quantity} ` : ''}{h.price != null ? `@ ${fmtMoney(h.price)}` : ''} · {h.accountName}
                  </div>
                </div>
                <div className="text-right text-[13.5px] font-semibold tabular-nums">{money0(h.marketValue)}</div>
                <div className={`text-right w-20 text-[12.5px] tabular-nums ${h.gain == null ? 'text-text-muted' : h.gain >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {h.gain == null ? '—' : `${h.gainPct != null ? (h.gainPct >= 0 ? '+' : '') + h.gainPct.toFixed(1) + '%' : moneySigned(h.gain)}`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset-class allocation */}
        <div className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h3 className="text-[14px] font-semibold mb-4">Asset allocation</h3>
          <div className="flex h-3 rounded-full overflow-hidden mb-4">
            {allocation.map((a, i) => (
              <div key={a.assetClass} style={{ width: `${a.share}%`, background: ALLOC_PALETTE[i % ALLOC_PALETTE.length] }} title={`${assetClassLabel(a.assetClass)} ${a.share}%`} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {allocation.map((a, i) => (
              <div key={a.assetClass} className="flex items-center gap-2 text-[12.5px]">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: ALLOC_PALETTE[i % ALLOC_PALETTE.length] }} />
                <span className="flex-1 truncate text-text-secondary">{assetClassLabel(a.assetClass)}</span>
                <span className="tabular-nums text-text-tertiary">{money0(a.value)}</span>
                <span className="tabular-nums text-text-muted w-10 text-right">{a.share}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function InvestmentsClient({ data }: { data: InvestmentsData }) {
  const { totalValue, delta30, accounts, series, benchmark, holdings } = data;

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Investments" subtitle="Brokerage, retirement, and other holdings." className="mb-8" />
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold mb-1">No investment accounts yet</h2>
          <p className="text-[13px] text-text-tertiary max-w-md mx-auto mb-5">
            Add a brokerage, retirement, or crypto account and Vault tracks its value over time, allocation, and growth here.
          </p>
          <Link href="/accounts" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90">
            Go to Accounts
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Investments" subtitle="Portfolio value over time, from your account history." />

      {/* Hero value + chart */}
      <section className="rounded-2xl bg-surface-1 border border-border-subtle p-6 mb-5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted">Total value</div>
          {benchmark && (
            <div className="flex items-center gap-1.5 text-[12px] tabular-nums" title="S&P 500 (SPY) — live, delayed">
              <span className="text-text-tertiary">S&amp;P 500</span>
              <span className="text-text-secondary font-medium">{money0(benchmark.price)}</span>
              {benchmark.changePct != null && (
                <span className={benchmark.changePct >= 0 ? 'text-positive' : 'text-negative'}>
                  {benchmark.changePct >= 0 ? '+' : ''}{benchmark.changePct.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div className="text-[34px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{money0(totalValue)}</div>
          <div className={`text-[13px] tabular-nums ${delta30 >= 0 ? 'text-positive' : 'text-negative'}`}>
            {moneySigned(delta30)} <span className="text-text-tertiary">last 30 days</span>
          </div>
        </div>
        <AreaChart series={series} />
      </section>

      {holdings.rows.length > 0 && <HoldingsSection holdings={holdings} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Accounts */}
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h2 className="text-[14px] font-semibold mb-2">Accounts</h2>
          <div className="flex flex-col divide-y divide-border-subtle">
            {accounts.map((a, i) => (
              <AccountRow key={a.id} a={a} color={PALETTE[i % PALETTE.length]!} />
            ))}
          </div>
        </section>

        {/* Allocation */}
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h2 className="text-[14px] font-semibold mb-4">Allocation</h2>
          <div className="flex h-3 rounded-full overflow-hidden mb-4">
            {accounts.map((a, i) => (
              <div key={a.id} style={{ width: `${a.share}%`, background: PALETTE[i % PALETTE.length] }} title={`${a.name} ${a.share}%`} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {accounts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="size-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="flex-1 truncate text-text-secondary">{a.name}</span>
                <span className="tabular-nums text-text-tertiary">{a.share}%</span>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-text-muted mt-5 leading-relaxed">
            {holdings.rows.length > 0
              ? 'Allocation by account. See Holdings above for per-position market value, cost basis, and asset-class allocation.'
              : 'Allocation is by account today. Per-holding market value, cost basis, and asset-class allocation appear here once the brokerage-statement parser populates holdings.'}
          </p>
        </section>
      </div>
    </>
  );
}
