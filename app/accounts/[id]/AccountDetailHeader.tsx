'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AccountDetail, BalancePoint } from '@/lib/accounts/detail';

type PeriodId = '1m' | '3m' | '6m' | '1y' | 'all';
const PERIODS: { id: PeriodId; label: string; months: number | null }[] = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '1y', label: '1Y', months: 12 },
  { id: 'all', label: 'All', months: null },
];

function fmtMoney(n: number, { sign = false }: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const prefix = sign && n > 0 ? '+' : n < 0 ? '−' : '';
  return prefix + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0]!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function AccountDetailHeader({
  account,
  series,
}: {
  account: AccountDetail;
  series: BalancePoint[];
}) {
  const [period, setPeriod] = useState<PeriodId>('6m');
  const [hover, setHover] = useState<number | null>(null);
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  const isLiability = account.assetClass === 'liability';
  const sgn = isLiability ? -1 : 1; // show debt as a positive, rising line

  // Full display series (sign-adjusted), then the slice for the chosen period.
  const display = useMemo(() => series.map((p) => ({ date: p.date, value: p.balance * sgn })), [series, sgn]);

  const visible = useMemo(() => {
    if (display.length === 0) return [];
    const months = PERIODS.find((p) => p.id === period)?.months ?? null;
    if (months == null) return display;
    const last = display[display.length - 1]!.date;
    const start = shiftMonths(last, months);
    const sliced = display.filter((p) => p.date >= start);
    // Keep one anchor point before the window so the line enters from the left.
    const firstIdx = display.findIndex((p) => p.date >= start);
    if (firstIdx > 0) return [display[firstIdx - 1]!, ...sliced];
    return sliced;
  }, [display, period]);

  const current = display.length ? display[display.length - 1]!.value : 0;
  const startVal = visible.length ? visible[0]!.value : 0;
  const delta = current - startVal;
  const pct = startVal !== 0 ? (delta / Math.abs(startVal)) * 100 : 0;
  const improved = isLiability ? delta <= 0 : delta >= 0;

  // ── Chart geometry ──────────────────────────────────────────────────────
  const H = 220;
  const padL = 52;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const W = Math.max(width, 320);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const { linePath, areaPath, pts, yTicks, xLabels } = useMemo(() => {
    if (visible.length === 0) {
      return { linePath: '', areaPath: '', pts: [] as { x: number; y: number; p: { date: string; value: number } }[], yTicks: [] as { y: number; label: string }[], xLabels: [] as { x: number; label: string }[] };
    }
    const values = visible.map((p) => p.value);
    let min = Math.min(...values, 0);
    let max = Math.max(...values, 0);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;

    const startDate = visible[0]!.date;
    const endDate = visible[visible.length - 1]!.date;
    const span = Math.max(daysBetween(startDate, endDate), 1);

    const xFor = (d: string) => padL + (daysBetween(startDate, d) / span) * plotW;
    const yFor = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;

    const pts = visible.map((p) => ({ x: xFor(p.date), y: yFor(p.value), p }));
    const linePath = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const areaPath =
      `${linePath} L ${pts[pts.length - 1]!.x.toFixed(1)} ${(padT + plotH).toFixed(1)}` +
      ` L ${pts[0]!.x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

    const yTicks = [max, (max + min) / 2, min].map((v) => ({ y: yFor(v), label: fmtMoney(v) }));
    const labelCount = Math.min(5, visible.length);
    const xLabels = Array.from({ length: labelCount }, (_, i) => {
      const idx = Math.round((i / Math.max(labelCount - 1, 1)) * (visible.length - 1));
      const p = visible[idx]!;
      return { x: xFor(p.date), label: new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
    });
    return { linePath, areaPath, pts, yTicks, xLabels };
  }, [visible, plotW, plotH, padL, padT]);

  const hovered = hover != null ? pts[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (pts.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i]!.x - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  }

  return (
    <div className="ad-header">
      <div className="ad-top">
        <div className="ad-crumb">
          <Link href="/transactions">Transactions</Link>
          <span className="sep">›</span>
          <span className="ad-name">{account.displayName || account.name}</span>
          {account.last4 && <span className="ad-last4">({account.last4})</span>}
        </div>
        <div className="ad-period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={'ad-period-btn' + (period === p.id ? ' active' : '')}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ad-balance">
        <div className="ad-balance-label">Current balance</div>
        <div className="ad-balance-value">{fmtMoney(Math.abs(current))}</div>
        {visible.length > 1 && (
          <div className={'ad-change ' + (improved ? 'pos' : 'neg')}>
            <span className="arrow">{delta >= 0 ? '▲' : '▼'}</span>
            {fmtMoney(Math.abs(delta))}
            {startVal !== 0 && <span className="pct"> · {Math.abs(pct).toFixed(1)}%</span>}
            <span className="ad-change-period">{PERIODS.find((p) => p.id === period)?.label}</span>
          </div>
        )}
      </div>

      <div className="ad-chart" ref={wrapRef}>
        {visible.length === 0 ? (
          <div className="ad-chart-empty">No activity to chart yet.</div>
        ) : (
          <svg width={W} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line className="ad-grid" x1={padL} y1={t.y} x2={W - padR} y2={t.y} />
                <text className="ad-grid-label" x={padL - 8} y={t.y + 3} textAnchor="end">{t.label}</text>
              </g>
            ))}
            <path className="ad-area" d={areaPath} />
            <path className="ad-line" d={linePath} fill="none" />
            {xLabels.map((l, i) => (
              <text key={i} className="ad-x-label" x={l.x} y={H - 8} textAnchor="middle">{l.label}</text>
            ))}
            {hovered && (
              <g>
                <line className="ad-hover-line" x1={hovered.x} y1={padT} x2={hovered.x} y2={padT + plotH} />
                <circle className="ad-hover-dot" cx={hovered.x} cy={hovered.y} r={4} />
              </g>
            )}
          </svg>
        )}
        {hovered && (
          <div
            className="ad-tip"
            style={{ left: Math.min(Math.max(hovered.x, 60), W - 60) }}
          >
            <div className="ad-tip-date">{fmtDate(hovered.p.date)}</div>
            <div className="ad-tip-val">{fmtMoney(Math.abs(hovered.p.value))}</div>
          </div>
        )}
      </div>
    </div>
  );
}
