'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type SeriesPoint = { ym: string; income: number; expense: number };
export type CatAgg = {
  ym: string;
  flow: 'inflow' | 'outflow';
  catId: string;
  catName: string;
  catColor: string | null;
  groupId: string;
  groupName: string;
  groupColor: string | null;
  signed: number; // signed sum of amounts for that (month, category)
};

type Gran = 'month' | 'quarter' | 'year';
type Dim = 'category' | 'group';

// ── period helpers ─────────────────────────────────────────────────────────

function periodKey(ym: string, g: Gran): string {
  const [y, m] = ym.split('-');
  if (g === 'year') return y;
  if (g === 'quarter') return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
  return ym;
}

function periodLabel(key: string, g: Gran, short = false): string {
  if (g === 'year') return key;
  if (g === 'quarter') {
    const [y, q] = key.split('-Q');
    return short ? `Q${q}` : `Q${q} ${y}`;
  }
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return short
    ? d.toLocaleString('en-US', { month: 'short' })
    : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${n < 0 ? '-' : ''}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return usd0.format(n);
}

// ── measure container width for a crisp (non-scaled) chart ──────────────────

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(880);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const WINDOW: Record<Gran, number> = { month: 13, quarter: 8, year: 100 };

export function CashflowClient({ series, cats }: { series: SeriesPoint[]; cats: CatAgg[] }) {
  const [gran, setGran] = useState<Gran>('month');
  const [dim, setDim] = useState<Dim>('category');
  const [selected, setSelected] = useState<string>('');
  const [hover, setHover] = useState<{ key: string; x: number } | null>(null);

  // Bucket the monthly series into the chosen granularity.
  const buckets = useMemo(() => {
    const m = new Map<string, { key: string; income: number; expense: number }>();
    for (const p of series) {
      const k = periodKey(p.ym, gran);
      const b = m.get(k) ?? { key: k, income: 0, expense: 0 };
      b.income += p.income;
      b.expense += p.expense;
      m.set(k, b);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [series, gran]);

  const visible = useMemo(() => buckets.slice(-WINDOW[gran]), [buckets, gran]);

  // Default / clamp the selected period to the latest visible bucket.
  useEffect(() => {
    setSelected((prev) => {
      if (prev && visible.some((b) => b.key === prev)) return prev;
      return visible.length ? visible[visible.length - 1].key : '';
    });
  }, [visible]);

  const sel = buckets.find((b) => b.key === selected);
  const income = sel?.income ?? 0;
  const expense = sel?.expense ?? 0;
  const savings = income - expense;
  const rate = income > 0 ? (savings / income) * 100 : 0;

  // Breakdown for the selected period, grouped by category or parent group.
  const breakdown = useMemo(() => {
    const inflow = new Map<string, { key: string; name: string; color: string | null; amount: number }>();
    const outflow = new Map<string, { key: string; name: string; color: string | null; amount: number }>();
    for (const c of cats) {
      if (periodKey(c.ym, gran) !== selected) continue;
      const useGroup = dim === 'group';
      const k = useGroup ? c.groupId : c.catId;
      const name = useGroup ? c.groupName : c.catName;
      const color = useGroup ? c.groupColor : c.catColor;
      const amount = c.flow === 'inflow' ? c.signed : -c.signed; // display positive
      const target = c.flow === 'inflow' ? inflow : outflow;
      const e = target.get(k) ?? { key: k, name, color, amount: 0 };
      e.amount += amount;
      target.set(k, e);
    }
    const sortDesc = (a: { amount: number }, b: { amount: number }) => b.amount - a.amount;
    return {
      income: [...inflow.values()].filter((r) => Math.abs(r.amount) > 0.005).sort(sortDesc),
      expense: [...outflow.values()].filter((r) => Math.abs(r.amount) > 0.005).sort(sortDesc),
    };
  }, [cats, gran, selected, dim]);

  const selIndex = visible.findIndex((b) => b.key === selected);
  const step = (delta: number) => {
    const next = selIndex + delta;
    if (next >= 0 && next < visible.length) setSelected(visible[next].key);
  };

  return (
    <div className="cf">
      {/* Header */}
      <div className="cf-head">
        <div>
          <div className="eyebrow">Cashflow</div>
          <h1 className="cf-title">Income vs. Spending</h1>
        </div>
        <div className="cf-seg" role="tablist" aria-label="Granularity">
          {(['month', 'quarter', 'year'] as Gran[]).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={gran === g}
              className={gran === g ? 'active' : ''}
              onClick={() => setGran(g)}
            >
              {g === 'month' ? 'Monthly' : g === 'quarter' ? 'Quarterly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <Chart
        visible={visible}
        selected={selected}
        hover={hover}
        onSelect={setSelected}
        onHover={setHover}
        gran={gran}
      />

      {/* Selected period summary */}
      <div className="cf-period-bar">
        <div className="cf-period-nav">
          <button onClick={() => step(-1)} disabled={selIndex <= 0} aria-label="Previous period">‹</button>
          <span className="cf-period-label">{selected ? periodLabel(selected, gran) : '—'}</span>
          <button onClick={() => step(1)} disabled={selIndex < 0 || selIndex >= visible.length - 1} aria-label="Next period">›</button>
        </div>
      </div>

      <div className="cf-tiles">
        <Tile label="Income" value={usd0.format(income)} tone="green" />
        <Tile label="Expenses" value={usd0.format(expense)} tone="red" />
        <Tile label="Net Savings" value={usd0.format(savings)} tone={savings >= 0 ? 'green' : 'red'} />
        <Tile label="Savings Rate" value={`${rate.toFixed(1)}%`} tone="neutral" />
      </div>

      {/* Breakdown */}
      <div className="cf-break-head">
        <h2>Breakdown</h2>
        <div className="cf-seg sm" role="tablist" aria-label="Breakdown grouping">
          {(['category', 'group'] as Dim[]).map((d) => (
            <button key={d} role="tab" aria-selected={dim === d} className={dim === d ? 'active' : ''} onClick={() => setDim(d)}>
              {d === 'category' ? 'Category' : 'Group'}
            </button>
          ))}
        </div>
      </div>

      <div className="cf-break-grid">
        <BreakdownPanel title="Income" rows={breakdown.income} total={income} tone="green" />
        <BreakdownPanel title="Expenses" rows={breakdown.expense} total={expense} tone="red" />
      </div>
    </div>
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────

function Chart({
  visible,
  selected,
  hover,
  onSelect,
  onHover,
  gran,
}: {
  visible: { key: string; income: number; expense: number }[];
  selected: string;
  hover: { key: string; x: number } | null;
  onSelect: (k: string) => void;
  onHover: (h: { key: string; x: number } | null) => void;
  gran: Gran;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 300;
  const padX = 8;
  const padTop = 18;
  const padBottom = 30;
  const plotH = H - padTop - padBottom;
  const zeroY = padTop + plotH / 2;
  const halfH = plotH / 2;

  const maxMag = Math.max(
    1,
    ...visible.map((b) => Math.max(b.income, b.expense, Math.abs(b.income - b.expense))),
  );

  const n = Math.max(visible.length, 1);
  const slot = (width - padX * 2) / n;
  const barW = Math.min(26, slot * 0.46);
  const cx = (i: number) => padX + slot * i + slot / 2;
  const yFor = (v: number) => zeroY - (v / maxMag) * halfH;

  const netPts = visible.map((b, i) => `${cx(i)},${yFor(b.income - b.expense)}`).join(' ');
  const hoverBucket = hover ? visible.find((b) => b.key === hover.key) : null;

  // Gridlines at ±maxMag and ±maxMag/2 plus zero.
  const grids = [maxMag, maxMag / 2, 0, -maxMag / 2, -maxMag];

  return (
    <div className="cf-chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Income and spending over time">
        {grids.map((g, i) => (
          <g key={i}>
            <line x1={padX} x2={width - padX} y1={yFor(g)} y2={yFor(g)} className={g === 0 ? 'cf-axis-zero' : 'cf-grid'} />
            <text x={width - padX} y={yFor(g) - 3} className="cf-grid-label" textAnchor="end">
              {compact(g)}
            </text>
          </g>
        ))}

        {visible.map((b, i) => {
          const isSel = b.key === selected;
          const incH = (b.income / maxMag) * halfH;
          const expH = (b.expense / maxMag) * halfH;
          const x = cx(i) - barW / 2;
          return (
            <g
              key={b.key}
              className={`cf-bucket${isSel ? ' sel' : ''}`}
              onMouseEnter={() => onHover({ key: b.key, x: cx(i) })}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(b.key)}
            >
              {isSel && <rect x={cx(i) - slot / 2} y={padTop - 6} width={slot} height={plotH + 12} className="cf-sel-bg" rx={6} />}
              <rect x={x} y={zeroY - incH} width={barW} height={Math.max(incH, 0)} className="cf-bar-income" rx={2} />
              <rect x={x} y={zeroY} width={barW} height={Math.max(expH, 0)} className="cf-bar-expense" rx={2} />
              <text x={cx(i)} y={H - 10} textAnchor="middle" className={`cf-x-label${isSel ? ' sel' : ''}`}>
                {periodLabel(b.key, gran, true)}
              </text>
            </g>
          );
        })}

        {/* Net line on top */}
        <polyline points={netPts} className="cf-net-line" fill="none" />
        {visible.map((b, i) => (
          <circle key={b.key} cx={cx(i)} cy={yFor(b.income - b.expense)} r={b.key === selected ? 3.5 : 2} className="cf-net-dot" />
        ))}
      </svg>

      {hoverBucket && (
        <div className="cf-tip" style={{ left: hover!.x }}>
          <div className="cf-tip-title">{periodLabel(hoverBucket.key, gran)}</div>
          <div><span className="dot green" />Income <b>{usd0.format(hoverBucket.income)}</b></div>
          <div><span className="dot red" />Expenses <b>{usd0.format(hoverBucket.expense)}</b></div>
          <div><span className="dot net" />Net <b>{usd0.format(hoverBucket.income - hoverBucket.expense)}</b></div>
        </div>
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Tile({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="cf-tile">
      <div className={`cf-tile-value ${tone}`}>{value}</div>
      <div className="cf-tile-label">{label}</div>
    </div>
  );
}

function BreakdownPanel({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: { key: string; name: string; color: string | null; amount: number }[];
  total: number;
  tone: 'green' | 'red';
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <section className="cf-panel">
      <header>
        <h3>{title}</h3>
        <span className={`cf-panel-total ${tone}`}>{usd0.format(total)}</span>
      </header>
      {rows.length === 0 ? (
        <p className="cf-empty">No {title.toLowerCase()} this period.</p>
      ) : (
        <ul className="cf-rows">
          {rows.map((r) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <li key={r.key} className="cf-row">
                <span className="cf-row-dot" style={{ background: r.color ?? 'var(--text-3)' }} />
                <span className="cf-row-name" title={r.name}>{r.name}</span>
                <span className="cf-row-bar-track">
                  <span
                    className={`cf-row-bar ${tone}`}
                    style={{ width: `${Math.max(2, (Math.abs(r.amount) / max) * 100)}%` }}
                  />
                </span>
                <span className="cf-row-amt numeric">{usd2.format(r.amount)}</span>
                <span className="cf-row-pct numeric">{pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
