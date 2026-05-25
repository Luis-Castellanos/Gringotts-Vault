'use client';

import Link from 'next/link';

import type { InvAccount, InvestmentsData, ValuePoint } from '@/lib/investments/load';
import { accountTypeLabel } from '@/lib/account-types';

function money0(n: number): string {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}
function moneySigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

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

export function InvestmentsClient({ data }: { data: InvestmentsData }) {
  const { totalValue, delta30, accounts, series } = data;

  if (accounts.length === 0) {
    return (
      <>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Investments</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5 mb-8">Brokerage, retirement, and other holdings.</p>
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
          No investment accounts yet. Add a brokerage or retirement account on the Accounts page and it&rsquo;ll show here.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Investments</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">Portfolio value over time, from your account history.</p>
      </div>

      {/* Hero value + chart */}
      <section className="rounded-2xl bg-surface-1 border border-border-subtle p-6 mb-5">
        <div className="flex items-baseline gap-3 mb-1">
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted">Total value</div>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div className="text-[34px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{money0(totalValue)}</div>
          <div className={`text-[13px] tabular-nums ${delta30 >= 0 ? 'text-positive' : 'text-negative'}`}>
            {moneySigned(delta30)} <span className="text-text-tertiary">last 30 days</span>
          </div>
        </div>
        <AreaChart series={series} />
      </section>

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
            Allocation is by account today. Asset-class allocation, holdings, cost basis, and true performance need a holdings model — on the roadmap.
          </p>
        </section>
      </div>
    </>
  );
}
