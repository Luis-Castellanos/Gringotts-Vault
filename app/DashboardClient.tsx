'use client';

import Link from 'next/link';

import type { AccountGroup, DashboardData, NWPoint, TopCategory } from '@/lib/dashboard/load';
import { iconBg, iconFor } from '@/lib/categories/icons';

function money0(n: number): string {
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}
function moneySigned(n: number): string {
  return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');
}

// Lightweight SVG area sparkline (no chart lib — matches the app's hand-rolled charts).
function Sparkline({ series, height = 72 }: { series: NWPoint[]; height?: number }) {
  if (series.length < 2) return <div style={{ height }} />;
  const W = 600;
  const H = height;
  const vals = series.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = series.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 6 - ((v - min) / range) * (H - 12);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const up = vals[n - 1]! >= vals[0]!;
  const stroke = up ? 'var(--color-positive)' : 'var(--color-negative)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id="nw-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nw-spark)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function CashflowTile({ label, value, tone, sub }: { label: string; value: string; tone?: 'pos' | 'neg' | 'blue'; sub?: string }) {
  const color = tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : tone === 'blue' ? 'text-cat-blue' : 'text-text-primary';
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1.5">{label}</div>
      <div className={`text-[22px] font-semibold tracking-[-0.01em] tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[12px] text-text-tertiary mt-1">{sub}</div>}
    </section>
  );
}

function TopCategories({ cats }: { cats: TopCategory[] }) {
  const max = cats.length ? cats[0]!.amount : 1;
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold">Top spending</h2>
        <Link href="/cashflow" className="text-[12px] text-text-tertiary hover:text-text-primary">Cashflow →</Link>
      </div>
      {cats.length === 0 ? (
        <p className="text-[13px] text-text-tertiary py-4">No spending recorded this month.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cats.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-md text-[13px] shrink-0" style={{ background: iconBg(c.color) }}>
                {iconFor(c.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="truncate text-text-secondary">{c.name}</span>
                  <span className="tabular-nums text-text-primary ml-2">{money0(c.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.amount / max) * 100}%`, background: c.color ?? 'var(--color-cat-blue)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountsSnapshot({ groups }: { groups: AccountGroup[] }) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold">Accounts</h2>
        <Link href="/net-worth" className="text-[12px] text-text-tertiary hover:text-text-primary">Net Worth →</Link>
      </div>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex justify-between text-[12px] uppercase tracking-[0.06em] text-text-muted mb-2">
              <span>{g.label}</span>
              <span className="tabular-nums">{money0(g.total)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.accounts.slice(0, 5).map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="flex justify-between text-[13px] py-1 px-2 -mx-2 rounded-md hover:bg-surface-2">
                  <span className="truncate text-text-secondary">{a.name}</span>
                  <span className={`tabular-nums ml-2 ${a.balance < 0 ? 'text-negative' : 'text-text-primary'}`}>{money0(a.balance)}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const { netWorth, nwDelta30, nwSeries, monthLabel, income, spending, net, topCategories, groups, reviewCount } = data;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Dashboard</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">Where things stand, at a glance.</p>
      </div>

      {/* Hero: net worth + sparkline */}
      <section className="rounded-2xl bg-surface-1 border border-border-subtle p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1">Net worth</div>
            <div className="text-[34px] font-semibold tracking-[-0.02em] tabular-nums leading-none">{money0(netWorth)}</div>
            <div className={`text-[13px] mt-2 tabular-nums ${nwDelta30 >= 0 ? 'text-positive' : 'text-negative'}`}>
              {moneySigned(nwDelta30)} <span className="text-text-tertiary">last 30 days</span>
            </div>
          </div>
          <div className="flex gap-2">
            {reviewCount > 0 && (
              <Link href="/review" className="rounded-lg bg-accent-500 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-500/90">
                Review {reviewCount}
              </Link>
            )}
            <Link href="/transactions" className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Transactions</Link>
          </div>
        </div>
        <div className="mt-4">
          <Sparkline series={nwSeries} />
        </div>
      </section>

      {/* This-month cashflow */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <CashflowTile label={`Income · ${monthLabel}`} value={money0(income)} tone="blue" />
        <CashflowTile label="Spending" value={money0(spending)} tone="neg" />
        <CashflowTile label="Net" value={moneySigned(net)} tone={net >= 0 ? 'pos' : 'neg'} sub={income > 0 ? `${Math.round((net / income) * 100)}% saved` : undefined} />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopCategories cats={topCategories} />
        <AccountsSnapshot groups={groups} />
      </div>
    </>
  );
}
