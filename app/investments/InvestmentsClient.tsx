'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { Holdings, HoldingView, InvAccount, InvestmentsData, ValuePoint } from '@/lib/investments/load';
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

// Normalize a value series to % growth from its first point.
function toPct(series: ValuePoint[]): { date: string; pct: number }[] {
  if (series.length < 2 || !series[0]!.value) return [];
  const base = series[0]!.value;
  return series.map((p) => ({ date: p.date, pct: ((p.value - base) / base) * 100 }));
}

// Align a daily benchmark series to the portfolio's dates (last close at-or-before
// each date), then normalize to % from the first — a fair portfolio-vs-index curve.
function alignBenchmark(portfolioDates: string[], bench: ValuePoint[]): ValuePoint[] {
  if (bench.length === 0) return [];
  const sorted = [...bench].sort((a, b) => a.date.localeCompare(b.date));
  const out: ValuePoint[] = [];
  for (const d of portfolioDates) {
    let val: number | null = null;
    for (const b of sorted) { if (b.date <= d) val = b.value; else break; }
    if (val == null) return []; // benchmark doesn't cover the start → skip overlay
    out.push({ date: d, value: val });
  }
  return out;
}

/** Two normalized %-growth lines (portfolio vs benchmark) over the same dates. */
function PerformanceChart({ portfolio, benchmark, height = 200 }: { portfolio: ValuePoint[]; benchmark: ValuePoint[]; height?: number }) {
  const pPct = toPct(portfolio);
  const bPct = toPct(benchmark);
  if (pPct.length < 2) return null;
  const W = 1000;
  const H = height;
  const all = [...pPct.map((p) => p.pct), ...bPct.map((p) => p.pct), 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const n = pPct.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 8 - ((v - min) / range) * (H - 16);
  const path = (pts: { pct: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const pLast = pPct[pPct.length - 1]!.pct;
  const bLast = bPct.length ? bPct[bPct.length - 1]!.pct : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      {min < 0 && max > 0 && <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="var(--color-border-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 4" />}
      {bPct.length >= 2 && <path d={path(bPct)} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="5 4" />}
      <path d={path(pPct)} fill="none" stroke={pLast >= (bLast ?? 0) ? 'var(--color-positive)' : 'var(--color-cat-blue)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
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

/** Holdings grouped by account, accounts ordered by total market value desc. */
function groupByAccount(rows: HoldingView[]): [string, HoldingView[]][] {
  const m = new Map<string, HoldingView[]>();
  for (const h of rows) (m.get(h.accountName) ?? m.set(h.accountName, []).get(h.accountName)!).push(h);
  const total = (items: HoldingView[]) => items.reduce((s, h) => s + h.marketValue, 0);
  return [...m.entries()].sort((a, b) => total(b[1]) - total(a[1]));
}

function HoldingsSection({ holdings, realizedGain }: { holdings: Holdings; realizedGain: number }) {
  const { rows, totalValue, totalCost, totalGain, allocation, anyLive } = holdings;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : null;
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold">Holdings</h2>
        <span className="text-[11.5px] text-text-muted">{anyLive ? 'Live prices' : 'Statement values'}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatTile size="lg" label="Market value" value={money0(totalValue)} />
        <StatTile size="lg" label="Cost basis" value={totalCost > 0 ? money0(totalCost) : '—'} />
        <StatTile size="lg" label="Unrealized gain" value={totalCost > 0 ? moneySigned(totalGain) : '—'} tone={totalGain >= 0 ? 'pos' : 'neg'} sub={gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%` : undefined} />
        <StatTile size="lg" label="Realized gain" value={realizedGain !== 0 ? moneySigned(realizedGain) : '—'} tone={realizedGain >= 0 ? 'pos' : 'neg'} sub={realizedGain !== 0 ? 'est. from statements' : 'no sales detected'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        {/* Positions, grouped by account */}
        <div className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
          {groupByAccount(rows).map(([acctName, items]) => {
            const av = items.reduce((s, h) => s + h.marketValue, 0);
            const ag = items.every((h) => h.gain == null) ? null : items.reduce((s, h) => s + (h.gain ?? 0), 0);
            return (
              <div key={acctName} className="border-b border-border-subtle last:border-b-0">
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-surface-2/40">
                  <span className="text-[12px] font-semibold text-text-secondary truncate">{acctName}</span>
                  <span className="flex items-center gap-2 text-[12px] tabular-nums shrink-0">
                    <span className="font-semibold">{money0(av)}</span>
                    {ag != null && <span className={ag >= 0 ? 'text-positive' : 'text-negative'}>{moneySigned(ag)}</span>}
                  </span>
                </div>
                <div className="divide-y divide-border-subtle/60">
                  {items.map((h) => (
                    <div key={h.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-text-primary truncate">
                          {h.symbol ? <span className="tabular-nums">{h.symbol}</span> : h.name}
                          {h.symbol && <span className="text-text-tertiary font-normal"> · {h.name}</span>}
                        </div>
                        <div className="text-[11.5px] text-text-tertiary tabular-nums">
                          {h.quantity != null ? `${h.quantity} ` : ''}{h.price != null ? `@ ${fmtMoney(h.price)}` : ''}
                          {h.costBasis != null ? ` · cost ${money0(h.costBasis)}` : ''}
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
            );
          })}
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

const PERIODS = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL', 'CUSTOM'] as const;
type Period = (typeof PERIODS)[number];
type MainTab = 'overview' | 'holdings' | 'advanced';
type AdvancedTab = 'gains' | 'funds';
type GroupBy = 'assetClass' | 'account';
type ChartMode = 'bar' | 'trend';
const PERIOD_LABEL: Record<Period, string> = { '1M': '1M', '3M': '3M', '6M': '6M', YTD: 'YTD', '1Y': '1Y', ALL: 'All', CUSTOM: 'Custom' };
const securityTypeLabel = (k: string): string => {
  if (k === 'equity') return 'Stock';
  if (k === 'etf') return 'ETF';
  return assetClassLabel(k);
};
function periodCutoff(p: Period): string | null {
  if (p === 'ALL' || p === 'CUSTOM') return null;
  const d = new Date();
  if (p === 'YTD') return `${d.getFullYear()}-01-01`;
  d.setMonth(d.getMonth() - (p === '1M' ? 1 : p === '3M' ? 3 : p === '6M' ? 6 : 12));
  return d.toISOString().slice(0, 10);
}
function slicePeriod(series: ValuePoint[], p: Period, from?: string, to?: string): ValuePoint[] {
  if (p === 'CUSTOM') return series.filter((x) => (!from || x.date >= from) && (!to || x.date <= to));
  const cut = periodCutoff(p);
  return cut ? series.filter((x) => x.date >= cut) : series;
}

type GainBucket = {
  key: string;
  label: string;
  value: number;
  cost: number;
  gain: number;
  gainPct: number | null;
  holdings: HoldingView[];
};

function groupGainBuckets(rows: HoldingView[], groupBy: GroupBy): GainBucket[] {
  const map = new Map<string, GainBucket>();
  for (const row of rows) {
    const key = groupBy === 'assetClass' ? row.assetClass : row.accountName;
    const label = groupBy === 'assetClass' ? securityTypeLabel(row.assetClass) : row.accountName;
    const bucket = map.get(key) ?? { key, label, value: 0, cost: 0, gain: 0, gainPct: null, holdings: [] };
    bucket.value += row.marketValue;
    bucket.cost += row.costBasis ?? 0;
    bucket.gain += row.gain ?? 0;
    bucket.holdings.push(row);
    map.set(key, bucket);
  }
  return [...map.values()]
    .map((bucket) => ({
      ...bucket,
      value: Math.round(bucket.value * 100) / 100,
      cost: Math.round(bucket.cost * 100) / 100,
      gain: Math.round(bucket.gain * 100) / 100,
      gainPct: bucket.cost > 0 ? (bucket.gain / bucket.cost) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);
}

function GainLossChart({ buckets, mode }: { buckets: GainBucket[]; mode: ChartMode }) {
  if (buckets.length === 0) {
    return <div className="flex h-[420px] items-center justify-center text-[13px] text-text-muted">No holdings yet.</div>;
  }
  const W = 1100;
  const H = 420;
  const padL = 46;
  const padR = 24;
  const padT = 28;
  const padB = 62;
  const max = Math.max(...buckets.map((bucket) => Math.max(bucket.value, bucket.cost, Math.abs(bucket.gain))), 1);
  const y = (value: number) => padT + (H - padT - padB) - (value / max) * (H - padT - padB);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((pct) => max * pct);
  const barW = Math.min(92, (W - padL - padR) / Math.max(1, buckets.length) * 0.5);
  const slot = (W - padL - padR) / Math.max(1, buckets.length);

  if (mode === 'trend') {
    const points = buckets.map((bucket, index) => {
      const x = padL + slot * index + slot / 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y(bucket.gain + bucket.cost).toFixed(1)}`;
    }).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[420px] w-full" preserveAspectRatio="none" aria-label="Gain loss trend">
        {grid.map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} stroke="var(--color-border-subtle)" />
            <text x={padL - 12} y={y(tick) + 5} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="13">{money0(tick)}</text>
          </g>
        ))}
        <path d={points} fill="none" stroke="var(--color-positive)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {buckets.map((bucket, index) => {
          const x = padL + slot * index + slot / 2;
          return (
            <g key={bucket.key}>
              <circle cx={x} cy={y(bucket.value)} r="5" fill={bucket.gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} />
              <text x={x} y={H - 24} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="13">{bucket.label}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[420px] w-full" preserveAspectRatio="none" aria-label="Gain loss by group">
      {grid.map((tick) => (
        <g key={tick}>
          <line x1={padL} x2={W - padR} y1={y(tick)} y2={y(tick)} stroke="var(--color-border-subtle)" />
          <text x={padL - 12} y={y(tick) + 5} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="13">{money0(tick)}</text>
        </g>
      ))}
      {buckets.map((bucket, index) => {
        const x = padL + slot * index + slot / 2 - barW / 2;
        const costH = H - padB - y(bucket.cost);
        const gainH = Math.abs(y(bucket.cost) - y(bucket.cost + Math.max(bucket.gain, 0)));
        return (
          <g key={bucket.key}>
            <rect x={x} y={y(bucket.cost)} width={barW} height={costH} fill="var(--color-cat-blue)" opacity="0.82" />
            {bucket.gain >= 0 ? (
              <rect x={x} y={y(bucket.cost + bucket.gain)} width={barW} height={gainH} fill="var(--color-positive)" opacity="0.75" />
            ) : (
              <rect x={x} y={y(Math.abs(bucket.gain))} width={barW} height={Math.max(2, H - padB - y(Math.abs(bucket.gain)))} fill="var(--color-negative)" opacity="0.75" />
            )}
            {bucket.gainPct != null && (
              <text x={x + barW / 2} y={Math.max(16, y(bucket.value) - 8)} textAnchor="middle" fill={bucket.gain >= 0 ? 'var(--color-positive)' : 'var(--color-negative)'} fontSize="13" fontWeight="700">
                {bucket.gainPct >= 0 ? '+' : ''}{bucket.gainPct.toFixed(1)}%
              </text>
            )}
            <text x={x + barW / 2} y={H - 24} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="13">{bucket.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function exportGainLossCsv(rows: HoldingView[]) {
  const header = ['Security', 'Symbol', 'Account', 'Asset class', 'Quantity', 'Total cost basis', 'Current value', 'Gain/loss $', 'Gain/loss %'];
  const csvRows = rows.map((row) => [
    row.name,
    row.symbol ?? '',
    row.accountName,
    securityTypeLabel(row.assetClass),
    row.quantity ?? '',
    row.costBasis ?? '',
    row.marketValue,
    row.gain ?? '',
    row.gainPct ?? '',
  ]);
  const csv = [header, ...csvRows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'investment-gains-losses.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function GainLossPill({ value, percent }: { value: number | null; percent?: boolean }) {
  if (value == null) return <span className="text-text-tertiary">-</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex min-w-[82px] justify-center rounded-full px-3 py-1.5 text-[16px] font-semibold tabular-nums ${positive ? 'bg-positive/20 text-positive' : 'bg-negative/20 text-negative'}`}>
      {percent ? `${positive ? '↑ ' : '↓ '}${Math.abs(value).toFixed(2)}%` : moneySigned(value)}
    </span>
  );
}

function TaxLotEditorRow({ row }: { row: HoldingView }) {
  const acquiredDate = row.asOf ?? new Date().toISOString().slice(0, 10);
  const price = row.price ?? (row.quantity && row.costBasis ? row.costBasis / row.quantity : 0);
  const lotQuantity = row.quantity ?? 0;
  const costBasis = row.costBasis ?? 0;
  return (
    <div className="bg-[rgba(36,28,18,0.72)]">
      <div className="grid grid-cols-[1.3fr_0.85fr_0.95fr_0.8fr_1fr_1fr_1fr_1fr_44px] items-center gap-5 px-20 py-4 text-[15px] font-semibold text-text-tertiary">
        <span>Acquired date</span>
        <span>Holding period</span>
        <span>Price per share</span>
        <span>Lot quantity</span>
        <span>Cost basis</span>
        <span>Current value</span>
        <span>Gain/loss $</span>
        <span>Gain/loss %</span>
        <span />
      </div>
      <div className="grid grid-cols-[1.3fr_0.85fr_0.95fr_0.8fr_1fr_1fr_1fr_1fr_44px] items-center gap-5 px-20 py-4">
        <label className="relative">
          <span className="sr-only">Acquired date</span>
          <input
            type="date"
            defaultValue={acquiredDate}
            className="h-12 w-full rounded-xl border border-border-subtle bg-surface-1 px-4 text-[18px] text-text-primary outline-none focus:border-[var(--color-cat-cyan)]"
          />
        </label>
        <span className="text-[18px] text-text-tertiary">-</span>
        <input
          inputMode="decimal"
          defaultValue={fmtMoney(price)}
          className="h-12 rounded-xl border-2 border-[var(--color-cat-cyan)] bg-surface-1 px-4 text-right text-[18px] text-text-primary outline-none"
          aria-label="Price per share"
        />
        <input
          inputMode="decimal"
          defaultValue={lotQuantity}
          className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-4 text-right text-[18px] text-text-primary outline-none focus:border-[var(--color-cat-cyan)]"
          aria-label="Lot quantity"
        />
        <input
          inputMode="decimal"
          defaultValue={costBasis ? fmtMoney(costBasis) : '$0.00'}
          className="h-12 rounded-xl border border-border-subtle bg-surface-1 px-4 text-right text-[18px] text-text-primary outline-none focus:border-[var(--color-cat-cyan)]"
          aria-label="Cost basis"
        />
        <span className="text-right text-[18px] text-text-tertiary">-</span>
        <span className="text-right text-[18px] text-text-tertiary">-</span>
        <span className="text-right text-[18px] text-text-tertiary">-</span>
        <button type="button" className="text-[24px] text-text-tertiary hover:text-negative" aria-label="Delete tax lot">⌫</button>
      </div>
      <div className="px-20 pb-8 pt-2">
        <button type="button" className="text-[17px] font-semibold text-accent-400 hover:text-accent-300">Add tax lot</button>
      </div>
      <div className="grid grid-cols-[1.3fr_0.85fr_0.95fr_0.8fr_1fr_1fr_1fr_1fr_44px] items-center gap-5 bg-[rgba(75,55,32,0.28)] px-20 py-5 text-[18px] font-semibold">
        <span>Total</span>
        <span className="text-text-tertiary">-</span>
        <span className="text-right text-text-tertiary">-</span>
        <span className="text-right tabular-nums">{row.quantity ?? '-'}</span>
        <span className="text-right text-text-tertiary">-</span>
        <span className="text-right text-text-tertiary">-</span>
        <span className="text-right text-text-tertiary">-</span>
        <span className="text-right text-text-tertiary">-</span>
        <span />
      </div>
    </div>
  );
}

function AdvancedHoldingsTable({
  buckets,
  groupBy,
  setGroupBy,
  totalGain,
  totalGainPct,
}: {
  buckets: GainBucket[];
  groupBy: GroupBy;
  setGroupBy: React.Dispatch<React.SetStateAction<GroupBy>>;
  totalGain: number;
  totalGainPct: number | null;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
        <h2 className="text-[24px] font-semibold">Holdings</h2>
        <select className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-[14px] font-semibold text-text-secondary" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
          <option value="assetClass">By security type</option>
          <option value="account">By account</option>
        </select>
      </div>
      <div className="grid grid-cols-[minmax(360px,1.5fr)_140px_190px_170px_150px_150px] border-b border-border-subtle px-6 py-5 text-[15px] font-semibold text-text-secondary">
        <div>Security</div>
        <div className="text-right">Quantity</div>
        <div className="text-right">Total cost basis</div>
        <div className="text-right">Current value</div>
        <div className="text-right">Gain/loss $</div>
        <div className="text-right">Gain/loss %</div>
      </div>
      <div>
        {buckets.map((bucket) => (
          <div key={bucket.key}>
            <div className="border-b border-border-subtle bg-[rgba(75,55,32,0.18)] px-6 py-5 text-[17px] font-semibold text-text-tertiary">⌄ {bucket.label}</div>
            <div className="divide-y divide-border-subtle/75">
              {bucket.holdings.map((row) => (
                <div key={row.id}>
                  <div className="grid grid-cols-[minmax(360px,1.5fr)_140px_190px_170px_150px_150px] items-center px-6 py-7">
                    <div className="grid grid-cols-[24px_1fr] gap-4">
                      <button type="button" onClick={() => toggleExpanded(row.id)} className="pt-1 text-left text-[24px] text-text-tertiary hover:text-text-primary" aria-label={`${expandedRows.has(row.id) ? 'Collapse' : 'Expand'} tax lots for ${row.symbol ?? row.name}`}>
                        {expandedRows.has(row.id) ? '⌄' : '›'}
                      </button>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[20px] font-semibold text-text-primary">{row.symbol ?? row.name}</span>
                          <span className="text-[18px] font-semibold text-text-muted">(0)</span>
                          <span className="flex size-5 items-center justify-center rounded-full bg-[rgba(84,160,76,0.28)] text-[12px]">✺</span>
                          <span className="text-[17px] text-text-tertiary">{row.accountName}</span>
                        </div>
                        <p className="mt-2 max-w-[560px] text-[17px] leading-7 text-text-secondary">{row.name}</p>
                        <button type="button" onClick={() => toggleExpanded(row.id)} className="mt-7 text-[17px] font-semibold text-accent-400 hover:text-accent-300">Add tax lot</button>
                      </div>
                    </div>
                    <div className="text-right text-[18px] tabular-nums text-text-secondary">{row.quantity ?? '-'}</div>
                    <div className="text-right">
                      {row.costBasis != null ? (
                        <span className="text-[18px] tabular-nums text-text-primary">{money0(row.costBasis)}</span>
                      ) : (
                        <button type="button" onClick={() => toggleExpanded(row.id)} className="max-w-[140px] text-center text-[16px] font-semibold leading-6 text-accent-400">Add total cost basis</button>
                      )}
                    </div>
                    <div className="text-right text-[18px] tabular-nums text-text-primary">{money0(row.marketValue)}</div>
                    <div className="text-right"><GainLossPill value={row.gain} /></div>
                    <div className="text-right"><GainLossPill value={row.gainPct} percent /></div>
                  </div>
                  {expandedRows.has(row.id) && <TaxLotEditorRow row={row} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(360px,1.5fr)_140px_190px_170px_150px_150px] items-center border-t border-border-subtle bg-surface-1 px-6 py-7">
        <div className="text-[20px] font-semibold">Total</div>
        <div />
        <div />
        <div />
        <div className="text-right"><GainLossPill value={totalGain} /></div>
        <div className="text-right"><GainLossPill value={totalGainPct} percent /></div>
      </div>
    </section>
  );
}

function AdvancedInvestments({
  holdings,
  realizedGain,
}: {
  holdings: Holdings;
  realizedGain: number;
}) {
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>('gains');
  const [groupBy, setGroupBy] = useState<GroupBy>('assetClass');
  const [chartMode, setChartMode] = useState<ChartMode>('bar');
  const buckets = groupGainBuckets(holdings.rows, groupBy);
  const totalCost = holdings.totalCost;
  const totalGain = holdings.totalGain;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border-subtle bg-surface-1 p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[22px] font-semibold">Unrealized gains &amp; losses</h2>
              <span className="text-text-tertiary">ⓘ</span>
              <span className="rounded-full bg-[rgba(194,78,0,0.25)] px-3 py-1 text-[12px] font-semibold text-accent-400">⌘ Plus</span>
            </div>
            <div className="mt-5 flex gap-3">
              {([
                ['gains', 'Gains & Losses'],
                ['funds', 'Funds'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setAdvancedTab(id)} className={`rounded-full px-5 py-2 text-[14px] font-semibold ${advancedTab === id ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-[14px] font-semibold text-text-secondary" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
              <option value="assetClass">By security type</option>
              <option value="account">By account</option>
            </select>
            <div className="inline-flex overflow-hidden rounded-xl border border-border-subtle">
              <button type="button" onClick={() => setChartMode('bar')} className={`px-4 py-3 text-[14px] ${chartMode === 'bar' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary'}`}>▥</button>
              <button type="button" onClick={() => setChartMode('trend')} className={`border-l border-border-subtle px-4 py-3 text-[14px] ${chartMode === 'trend' ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary'}`}>↗</button>
            </div>
            <button type="button" onClick={() => exportGainLossCsv(holdings.rows)} className="rounded-xl border border-border-subtle px-4 py-3 text-[14px] font-semibold text-text-secondary hover:bg-surface-2">⇩</button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[rgba(0,112,121,0.4)] px-5 py-4 text-[15px] text-[var(--color-cat-cyan)]">
          <span>ⓘ Missing cost basis or tax lots.</span>
          <button type="button" className="font-semibold">Add cost basis</button>
        </div>

        <div className="mb-7 grid rounded-xl border border-border-subtle md:grid-cols-4">
          {[
            ['Portfolio value', money0(holdings.totalValue), ''],
            ['Portfolio cost (partial) ⓘ', totalCost > 0 ? money0(totalCost) : '—', ''],
            ['Gain / loss value (partial) ⓘ', totalCost > 0 ? moneySigned(totalGain) : '—', totalGain >= 0 ? 'text-positive' : 'text-negative'],
            ['Gain / loss percent (partial) ⓘ', gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : '—', (gainPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'],
          ].map(([label, value, tone]) => (
            <div key={label} className="px-7 py-7 text-center">
              <p className={`text-[24px] font-semibold tabular-nums ${tone}`}>{value}</p>
              <p className="mt-3 text-[14px] font-semibold text-text-tertiary">{label}</p>
            </div>
          ))}
        </div>

        {advancedTab === 'gains' ? (
          <>
            <GainLossChart buckets={buckets} mode={chartMode} />
            <div className="mt-4 flex justify-center gap-6 text-[13px] text-text-tertiary">
              <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-cat-blue" /> Cost Basis</span>
              <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-positive" /> Gain</span>
              <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-negative" /> Loss</span>
            </div>
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {buckets.map((bucket) => (
              <div key={bucket.key} className="rounded-xl border border-border-subtle bg-surface-2 px-5 py-4">
                <p className="text-[15px] font-semibold">{bucket.label}</p>
                <p className="mt-2 text-[24px] font-semibold tabular-nums">{money0(bucket.value)}</p>
                <p className={`mt-1 text-[13px] font-semibold ${bucket.gain >= 0 ? 'text-positive' : 'text-negative'}`}>{moneySigned(bucket.gain)} {bucket.gainPct != null ? `· ${bucket.gainPct >= 0 ? '+' : ''}${bucket.gainPct.toFixed(1)}%` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdvancedHoldingsTable
        buckets={buckets}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        totalGain={totalGain}
        totalGainPct={gainPct}
      />
      {realizedGain !== 0 && <p className="px-6 text-[12px] text-text-tertiary">Estimated realized gain from statement snapshots: <span className={realizedGain >= 0 ? 'text-positive' : 'text-negative'}>{moneySigned(realizedGain)}</span>.</p>}
    </div>
  );
}

export function InvestmentsClient({ data }: { data: InvestmentsData }) {
  const { totalValue, delta30, accounts, series, holdingsSeries, benchmarkSeries, benchmark, holdings } = data;
  const [mainTab, setMainTab] = useState<MainTab>('advanced');
  const [period, setPeriod] = useState<Period>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Prefer the true market-value series (from holdings snapshots); fall back to
  // the cash-flow (net contributions) series when there's no holdings history.
  const hasMV = holdingsSeries.length >= 2;
  const baseSeries = hasMV ? holdingsSeries : series;
  const chartSeries = slicePeriod(baseSeries, period, customFrom, customTo);
  const benchFull = hasMV ? alignBenchmark(holdingsSeries.map((p) => p.date), benchmarkSeries) : [];
  // Performance %s are period-relative (normalized to the first point in range).
  const portSliced = slicePeriod(holdingsSeries, period, customFrom, customTo);
  const benchSliced = slicePeriod(benchFull, period, customFrom, customTo);
  const showPerf = hasMV && benchSliced.length >= 2 && portSliced.length >= 2;
  const portPct = showPerf ? toPct(portSliced) : [];
  const benchPct = showPerf ? toPct(benchSliced) : [];
  const portReturn = portPct.length ? portPct[portPct.length - 1]!.pct : null;
  const benchReturn = benchPct.length ? benchPct[benchPct.length - 1]!.pct : null;

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Investments" className="mb-8" />
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5h-5" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold mb-1">No investment accounts yet</h2>
          <Link href="/accounts" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90">
            Go to Accounts
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap items-center gap-5">
          {([
            ['overview', 'Investments', null],
            ['holdings', 'Holdings', null],
            ['advanced', 'Advanced', '⌘ Plus'],
          ] as const).map(([id, label, badge]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMainTab(id)}
              className={`border-b-2 px-0 py-3 text-[20px] font-semibold transition ${mainTab === id ? 'border-accent-500 text-accent-400' : 'border-transparent text-text-tertiary hover:text-text-primary'}`}
            >
              {label}
              {badge && <span className="ml-2 rounded-full bg-[rgba(194,78,0,0.25)] px-2 py-1 text-[12px] text-accent-400">{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button type="button" className="rounded-xl border border-border-subtle px-4 py-3 text-[15px] font-semibold text-text-secondary">Accounts⌄</button>
          <button type="button" className="rounded-xl bg-accent-500 px-5 py-3 text-[15px] font-semibold text-[var(--color-accent-contrast)]">Add⌄</button>
        </div>
      </header>

      {mainTab === 'advanced' && <AdvancedInvestments holdings={holdings} realizedGain={data.realizedGain} />}

      {mainTab === 'holdings' && (
        holdings.rows.length > 0 ? <HoldingsSection holdings={holdings} realizedGain={data.realizedGain} /> : (
          <section className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
            Upload investment statements with positions to populate holdings.
          </section>
        )
      )}

      {mainTab === 'overview' && (
        <>

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
        <div className="flex justify-end items-center gap-3 flex-wrap mb-2">
          {period === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-base px-2 py-1 text-[12px] focus:outline-none focus:border-border-strong" />
              <span>→</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-border-subtle bg-surface-base px-2 py-1 text-[12px] focus:outline-none focus:border-border-strong" />
            </div>
          )}
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border-subtle p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${period === p ? 'bg-accent-500 text-white' : 'text-text-tertiary hover:text-text-primary'}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <AreaChart series={chartSeries} />
        <div className="text-[11px] text-text-muted mt-1">{hasMV ? 'Market value from statement holdings.' : 'Net contributions from account history (upload brokerage statements for true market value).'}</div>
      </section>

      {/* Performance vs benchmark */}
      {showPerf && (
        <section className="rounded-2xl bg-surface-1 border border-border-subtle p-6 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-[15px] font-semibold">Performance vs S&amp;P 500</h2>
            <div className="flex items-center gap-4 text-[12.5px] tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 rounded" style={{ background: (portReturn ?? 0) >= (benchReturn ?? 0) ? 'var(--color-positive)' : 'var(--color-cat-blue)' }} />
                Portfolio <b className={(portReturn ?? 0) >= 0 ? 'text-positive' : 'text-negative'}>{portReturn != null ? `${portReturn >= 0 ? '+' : ''}${portReturn.toFixed(1)}%` : '—'}</b>
              </span>
              <span className="flex items-center gap-1.5 text-text-tertiary">
                <span className="inline-block w-4 h-0.5 rounded border-t border-dashed border-text-muted" />
                S&amp;P 500 {benchReturn != null ? `${benchReturn >= 0 ? '+' : ''}${benchReturn.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
          <PerformanceChart portfolio={portSliced} benchmark={benchSliced} />
          <div className="text-[11px] text-text-muted mt-1">% growth since {portSliced[0]!.date}. Benchmark is SPY (S&amp;P 500 proxy), aligned to your statement dates.</div>
        </section>
      )}

      {holdings.rows.length > 0 && <HoldingsSection holdings={holdings} realizedGain={data.realizedGain} />}

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
        </section>
      </div>
        </>
      )}
    </>
  );
}
