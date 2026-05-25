'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { iconBg, iconFor } from '@/lib/categories/icons';

export type AcctLite = { id: string; name: string };
export type Flow = 'inflow' | 'outflow' | 'transfer';
export type CatAgg = {
  ym: string;
  flow: Flow;
  catId: string;
  catName: string;
  catColor: string | null;
  groupId: string;
  groupName: string;
  groupColor: string | null;
  accountId: string;
  accountName: string;
  signed: number; // signed sum of amounts for that (month, account, category)
};

type Gran = 'month' | 'quarter' | 'year';
type Dim = 'category' | 'group';
type Tone = 'blue' | 'red' | 'green' | 'neutral';
type Bucket = { key: string; income: number; expense: number };
type Row = { key: string; name: string; color: string | null; amount: number };

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

function lastDay(y: number, m: number): string {
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// First/last calendar day covered by a period key, for the Transactions drill-down.
function periodRange(key: string, g: Gran): { from: string; to: string } {
  if (g === 'year') return { from: `${key}-01-01`, to: `${key}-12-31` };
  if (g === 'quarter') {
    const [y, q] = key.split('-Q');
    const qn = Number(q);
    return { from: `${y}-${String((qn - 1) * 3 + 1).padStart(2, '0')}-01`, to: lastDay(Number(y), qn * 3) };
  }
  const [y, m] = key.split('-');
  return { from: `${y}-${m}-01`, to: lastDay(Number(y), Number(m)) };
}

// Continuous month list 'YYYY-MM' from min..max inclusive, so the chart's
// x-axis stays stable regardless of which accounts are filtered in/out.
function enumerateMonths(minYm: string, maxYm: string): string[] {
  const out: string[] = [];
  let [y, m] = minYm.split('-').map(Number) as [number, number];
  const [ey, em] = maxYm.split('-').map(Number) as [number, number];
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function signedUsd2(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '') + usd2.format(Math.abs(n));
}
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${n < 0 ? '−' : ''}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
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

const DEFAULT_RANGE: Record<Gran, number | 'all'> = { month: 12, quarter: 8, year: 'all' };

export function CashflowClient({ cats, accounts }: { cats: CatAgg[]; accounts: AcctLite[] }) {
  const router = useRouter();
  const [gran, setGran] = useState<Gran>('month');
  const [dim, setDim] = useState<Dim>('group');
  const [sortKey, setSortKey] = useState<'amount' | 'amount-asc' | 'name'>('amount');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [hover, setHover] = useState<{ key: string; x: number } | null>(null);
  const [offset, setOffset] = useState(0); // buckets shifted back from the latest window
  // Account filter — defaults to every account selected (i.e. all activity).
  const [acctSel, setAcctSel] = useState<Set<string>>(() => new Set(accounts.map((a) => a.id)));
  useEffect(() => { setOffset(0); }, [gran]);

  const allSelected = acctSel.size === accounts.length;
  const fcats = useMemo(
    () => (allSelected ? cats : cats.filter((c) => acctSel.has(c.accountId))),
    [cats, acctSel, allSelected],
  );

  // Stable, continuous timeline derived from the full (unfiltered) data set.
  const allMonths = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const c of cats) {
      if (!min || c.ym < min) min = c.ym;
      if (!max || c.ym > max) max = c.ym;
    }
    return min && max ? enumerateMonths(min, max) : [];
  }, [cats]);

  // Per-period income / expense (transfers don't touch the chart — they net out
  // of cashflow by definition and live in their own breakdown section).
  const buckets = useMemo<Bucket[]>(() => {
    const m = new Map<string, Bucket>();
    for (const ym of allMonths) {
      const k = periodKey(ym, gran);
      if (!m.has(k)) m.set(k, { key: k, income: 0, expense: 0 });
    }
    for (const c of fcats) {
      if (c.flow === 'transfer') continue;
      const k = periodKey(c.ym, gran);
      const b = m.get(k) ?? { key: k, income: 0, expense: 0 };
      if (c.flow === 'inflow') b.income += c.signed;
      else b.expense += -c.signed; // outflows are negative; negate to positive spend
      m.set(k, b);
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [allMonths, fcats, gran]);

  const range = DEFAULT_RANGE[gran];
  const count = range === 'all' ? buckets.length : Math.min(range, buckets.length);
  const endIdx = Math.max(0, buckets.length - 1 - offset);
  const startIdx = Math.max(0, endIdx - count + 1);
  const visible = buckets.slice(startIdx, endIdx + 1);
  const canBack = startIdx > 0;
  const canFwd = offset > 0;
  const pageBack = () => setOffset((o) => Math.min(Math.max(0, buckets.length - count), o + count));
  const pageFwd = () => setOffset((o) => Math.max(0, o - count));

  // Default / clamp the selected period to the latest visible bucket.
  useEffect(() => {
    setSelected((prev) => {
      if (prev && visible.some((b) => b.key === prev)) return prev;
      return visible.length ? visible[visible.length - 1].key : '';
    });
  }, [visible]);

  const selIdx = buckets.findIndex((b) => b.key === selected);
  const sel = selIdx >= 0 ? buckets[selIdx] : undefined;
  const income = sel?.income ?? 0;
  const expense = sel?.expense ?? 0;
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  // Change vs. the immediately preceding period (Fidelity-style headline delta).
  const prev = selIdx > 0 ? buckets[selIdx - 1] : null;
  const prevNet = prev ? prev.income - prev.expense : null;
  const netDelta = prevNet != null ? net - prevNet : null;
  const netDeltaPct = prevNet ? (netDelta! / Math.abs(prevNet)) * 100 : null;

  // Breakdown for the selected period, grouped by category or parent group, and
  // split into the three flow buckets.
  const breakdown = useMemo(() => {
    const make = () => new Map<string, Row>();
    const inflow = make();
    const outflow = make();
    const transfer = make();
    for (const c of fcats) {
      if (periodKey(c.ym, gran) !== selected) continue;
      const useGroup = dim === 'group';
      const k = useGroup ? c.groupId : c.catId;
      const name = useGroup ? c.groupName : c.catName;
      const color = useGroup ? c.groupColor : c.catColor;
      const target = c.flow === 'inflow' ? inflow : c.flow === 'transfer' ? transfer : outflow;
      // Inflows display their (positive) signed amount. Outflows and transfers
      // both show money leaving the account as a positive figure — for transfers
      // that's the out-leg only, so a fully-tracked internal move (e.g. a card
      // payment) shows the cash that left rather than netting to zero.
      const amount =
        c.flow === 'inflow' ? c.signed
        : c.flow === 'outflow' ? -c.signed
        : Math.max(-c.signed, 0);
      if (amount === 0) continue;
      const e = target.get(k) ?? { key: k, name, color, amount: 0 };
      e.amount += amount;
      target.set(k, e);
    }
    const q = filter.trim().toLowerCase();
    const prep = (m: Map<string, Row>) => {
      let arr = [...m.values()].filter((r) => Math.abs(r.amount) > 0.005);
      if (q) arr = arr.filter((r) => r.name.toLowerCase().includes(q));
      arr.sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name);
        if (sortKey === 'amount-asc') return Math.abs(a.amount) - Math.abs(b.amount);
        return Math.abs(b.amount) - Math.abs(a.amount);
      });
      return arr;
    };
    return { income: prep(inflow), expense: prep(outflow), transfer: prep(transfer) };
  }, [fcats, gran, selected, dim, filter, sortKey]);

  const transferTotal = breakdown.transfer.reduce((s, r) => s + r.amount, 0);

  // Drill into the Transactions ledger for a clicked breakdown row, scoped to
  // that category (or all children of a group) and the selected period.
  const drill = (rowKey: string) => {
    if (!selected) return;
    const ids =
      dim === 'category'
        ? [rowKey]
        : [...new Set(fcats.filter((c) => c.groupId === rowKey).map((c) => c.catId))];
    const cat = ids.map((id) => (id === 'uncategorized' ? '__uncategorized__' : id)).join(',');
    const { from, to } = periodRange(selected, gran);
    const qs = new URLSearchParams({ from, to });
    if (cat) qs.set('cats', cat);
    router.push(`/transactions?${qs.toString()}`);
  };

  return (
    <div className="cf">
      {/* Toolbar — granularity + account filter */}
      <div className="cf-toolbar">
        <div className="cf-pills" role="tablist" aria-label="Granularity">
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
        <AccountFilter accounts={accounts} selected={acctSel} onChange={setAcctSel} />
      </div>

      {/* Main chart card */}
      <section className="cf-card">
        <div className="cf-card-hd">
          <div className="cf-headline">
            <span className="lbl">Net savings · {selected ? periodLabel(selected, gran) : '—'}</span>
            <span className={`val ${net >= 0 ? 'green' : 'red'}`}>{usd2.format(net)}</span>
            {netDelta != null && (
              <span className={`delta ${netDelta > 0 ? 'pos' : netDelta < 0 ? 'neg' : ''}`}>
                <span className="arrow">{netDelta > 0 ? '↗' : netDelta < 0 ? '↘' : '·'}</span>
                {signedUsd2(netDelta)}
                {netDeltaPct != null && ` (${netDeltaPct >= 0 ? '+' : ''}${netDeltaPct.toFixed(1)}%)`}
                <span className="vs">vs. prior {gran}</span>
              </span>
            )}
          </div>
          <div className="cf-pager">
            <button onClick={pageBack} disabled={!canBack} aria-label="Earlier periods">‹</button>
            <span className="cf-range-label">
              {visible.length ? `${periodLabel(visible[0].key, gran, true)} – ${periodLabel(visible[visible.length - 1].key, gran)}` : '—'}
            </span>
            <button onClick={pageFwd} disabled={!canFwd} aria-label="Later periods">›</button>
          </div>
        </div>

        {/* Inline metrics */}
        <div className="cf-metrics">
          <Metric label="Income" value={usd0.format(income)} tone="blue" />
          <Metric label="Expenses" value={usd0.format(expense)} tone="red" />
          <Metric label="Net savings" value={usd0.format(net)} tone={net >= 0 ? 'green' : 'red'} />
          <Metric label="Savings rate" value={`${savingsRate.toFixed(1)}%`} tone="neutral" />
        </div>

        <Chart
          visible={visible}
          selected={selected}
          hover={hover}
          onSelect={setSelected}
          onHover={setHover}
          gran={gran}
        />

        <div className="cf-legend">
          <span><i className="sw blue" />Income</span>
          <span><i className="sw red" />Expenses</span>
          <span><i className="sw line green" />Net savings</span>
        </div>
      </section>

      {/* Breakdown */}
      <div className="cf-break-head">
        <h2>Breakdown</h2>
        <div className="cf-break-controls">
          <input
            className="cf-break-search"
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter categories"
          />
          <select
            className="cf-break-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as 'amount' | 'amount-asc' | 'name')}
            aria-label="Sort breakdown"
          >
            <option value="amount">Amount ↓</option>
            <option value="amount-asc">Amount ↑</option>
            <option value="name">Name A–Z</option>
          </select>
          <div className="cf-pills sm" role="tablist" aria-label="Breakdown grouping">
            {(['group', 'category'] as Dim[]).map((d) => (
              <button key={d} role="tab" aria-selected={dim === d} className={dim === d ? 'active' : ''} onClick={() => setDim(d)}>
                {d === 'category' ? 'Sub category' : 'Category'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="cf-break-stack">
        <BreakdownPanel title="Inflows" rows={breakdown.income} total={income} tone="blue" onDrill={drill} />
        <BreakdownPanel title="Outflows" rows={breakdown.expense} total={expense} tone="red" onDrill={drill} />
        <BreakdownPanel title="Transfers" rows={breakdown.transfer} total={transferTotal} tone="neutral" onDrill={drill} />
      </div>
    </div>
  );
}

// ── Account filter (hierarchical: "All accounts" master + per-account) ───────

function AccountFilter({
  accounts,
  selected,
  onChange,
}: {
  accounts: AcctLite[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const allOn = selected.size === accounts.length;
  const noneOn = selected.size === 0;

  const label = allOn
    ? 'All accounts'
    : noneOn
      ? 'No accounts'
      : `${selected.size} of ${accounts.length} accounts`;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const toggleAll = () => onChange(allOn ? new Set() : new Set(accounts.map((a) => a.id)));

  if (accounts.length === 0) return null;

  return (
    <div className="cf-acct">
      <button
        type="button"
        className={'cf-acct-btn' + (allOn ? '' : ' active')}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 3h11M3.5 7h7M5.5 11h3" />
        </svg>
        {label}
        <svg className="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <>
          <div className="cf-acct-backdrop" onClick={() => setOpen(false)} />
          <div className="cf-acct-pop" role="listbox">
            <label className="cf-acct-opt master">
              <Check checked={allOn} indeterminate={!allOn && !noneOn} onChange={toggleAll} />
              <span className="nm">All accounts</span>
            </label>
            <div className="cf-acct-list">
              {accounts.map((a) => (
                <label key={a.id} className="cf-acct-opt">
                  <Check checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="nm" title={a.name}>{a.name}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Check({
  checked,
  indeterminate = false,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
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
  visible: Bucket[];
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

        {/* Net savings line on top */}
        <polyline points={netPts} className="cf-net-line" fill="none" />
        {visible.map((b, i) => (
          <circle key={b.key} cx={cx(i)} cy={yFor(b.income - b.expense)} r={b.key === selected ? 3.5 : 2} className="cf-net-dot" />
        ))}
      </svg>

      {hoverBucket && (
        <div className="cf-tip" style={{ left: hover!.x }}>
          <div className="cf-tip-title">{periodLabel(hoverBucket.key, gran)}</div>
          <div><span className="dot blue" />Income <b>{usd0.format(hoverBucket.income)}</b></div>
          <div><span className="dot red" />Expenses <b>{usd0.format(hoverBucket.expense)}</b></div>
          <div><span className="dot green" />Net <b>{usd0.format(hoverBucket.income - hoverBucket.expense)}</b></div>
        </div>
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Metric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="cf-metric">
      <div className="cf-metric-label">{label}</div>
      <div className={`cf-metric-value ${tone}`}>{value}</div>
    </div>
  );
}

function BreakdownPanel({
  title,
  rows,
  total,
  tone,
  signed = false,
  onDrill,
}: {
  title: string;
  rows: Row[];
  total: number;
  tone: Tone;
  signed?: boolean;
  onDrill: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  const denom = Math.max(1, ...[Math.abs(total), ...rows.map((r) => Math.abs(r.amount))]);
  return (
    <section className="cf-panel">
      <header>
        <h3>{title}</h3>
        <span className={`cf-panel-total ${tone}`}>{signed ? signedUsd2(total) : usd0.format(total)}</span>
      </header>
      {rows.length === 0 ? (
        <p className="cf-empty">No {title.toLowerCase()} this period.</p>
      ) : (
        <ul className="cf-rows">
          {rows.map((r) => {
            const pct = (Math.abs(r.amount) / denom) * 100;
            return (
              <li
                key={r.key}
                className="cf-row"
                style={{ ['--w' as string]: `${Math.max(3, (Math.abs(r.amount) / max) * 100)}%` }}
                onClick={() => onDrill(r.key)}
                title={`View ${r.name} transactions for this period`}
              >
                <span className={`cf-row-fill ${tone}`} />
                <span className="cf-row-icon" style={{ background: iconBg(r.color) }}>{iconFor(r.name)}</span>
                <span className="cf-row-name" title={r.name}>{r.name}</span>
                <span className="cf-row-amt numeric">{signed ? signedUsd2(r.amount) : usd2.format(r.amount)}</span>
                <span className="cf-row-pct numeric">{pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
