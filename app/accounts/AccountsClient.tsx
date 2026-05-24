'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────
export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'brokerage'
  | 'retirement'
  | 'loan'
  | 'cash'
  | 'other';

export type AccountRow = {
  id: string;
  name: string;
  displayName: string;
  type: AccountType;
  institution: string;
  last4: string;
  isActive: boolean;
  openedDate: string | null;
  closedDate: string | null;
  earliestTxnDate: string | null;
  balance: number;
  delta30: number;
  lastActivity: string | null;
  sparkline: number[];
  creditLimit: number | null;
  apr: number | null;
};

export type NWPoint = { date: string; value: number };

// ─── Constants & helpers ──────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);
const RANGES = ['7D', '1M', '3M', '6M', 'YTD', '1Y', '2Y', 'All'] as const;
type RangeKey = (typeof RANGES)[number] | 'Custom';
type CustomRange = { from: string; to: string };

type GroupName = 'Cash' | 'Investments' | 'Liabilities' | 'Other';

type TypeMeta = {
  label: string;
  group: GroupName;
  subgroup?: string;
  asset: boolean;
};

const TYPE_META: Record<AccountType, TypeMeta> = {
  checking:    { label: 'Checking',    group: 'Cash',        asset: true },
  savings:     { label: 'Savings',     group: 'Cash',        asset: true },
  cash:        { label: 'Cash',        group: 'Cash',        asset: true },
  brokerage:   { label: 'Brokerage',   group: 'Investments', subgroup: 'Taxable brokerage', asset: true },
  retirement:  { label: 'Retirement',  group: 'Investments', subgroup: 'Retirement',        asset: true },
  credit_card: { label: 'Credit',      group: 'Liabilities', subgroup: 'Credit cards',      asset: false },
  loan:        { label: 'Loan',        group: 'Liabilities', subgroup: 'Loans',             asset: false },
  other:       { label: 'Other',       group: 'Other',       asset: true },
};

const GROUP_ORDER: GroupName[] = ['Cash', 'Investments', 'Liabilities', 'Other'];
const SUBGROUP_ORDER: Partial<Record<GroupName, string[]>> = {
  Investments: ['Retirement', 'Taxable brokerage'],
  Liabilities: ['Credit cards', 'Loans'],
};

const ASSET_SEGMENTS: { key: string; name: string; color: string; types: AccountType[] }[] = [
  { key: 'checking',   name: 'Checking',          color: '#2563eb', types: ['checking', 'cash'] },
  { key: 'savings',    name: 'Savings',           color: '#16a34a', types: ['savings'] },
  { key: 'retirement', name: 'Retirement',        color: '#0891b2', types: ['retirement'] },
  { key: 'taxable',    name: 'Taxable brokerage', color: '#7c3aed', types: ['brokerage'] },
];
const LIAB_SEGMENTS: { key: string; name: string; color: string; types: AccountType[] }[] = [
  { key: 'credit', name: 'Credit cards', color: '#dc2626', types: ['credit_card'] },
  { key: 'loans',  name: 'Loans',        color: '#9a3412', types: ['loan'] },
];

const INSTITUTION_DOMAINS: Record<string, string> = {
  'Chase':                     'chase.com',
  'Ally Bank':                 'ally.com',
  'Capital One':               'capitalone.com',
  'Bank of America':           'bankofamerica.com',
  'U.S. Bank':                 'usbank.com',
  'Goldman Sachs':             'marcus.com',
  'Goldman Sachs / Apple':     'apple.com',
  'Apple / Goldman Sachs':     'apple.com',
  'Apple / Green Dot Bank':    'apple.com',
  'Fidelity':                  'fidelity.com',
  'Vanguard':                  'vanguard.com',
  'E*TRADE':                   'etrade.com',
  'Coinbase':                  'coinbase.com',
  'Nelnet':                    'nelnet.com',
  'Honda Financial':           'hondafinancialservices.com',
  'Discover':                  'discover.com',
  'American Express':          'americanexpress.com',
  'Charles Schwab':            'schwab.com',
  'Citi':                      'citi.com',
  'Synchrony Bank / Venmo':    'venmo.com',
  'Gain Federal Credit Union': 'gainfcu.com',
};

function instDomain(institution: string | null | undefined): string | null {
  if (!institution) return null;
  if (INSTITUTION_DOMAINS[institution]) return INSTITUTION_DOMAINS[institution]!;
  return institution.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

// ─── Formatters ───────────────────────────────────────────────────────────
function fmtMoneyA(n: number, { sign = false, decimals = 2 }: { sign?: boolean; decimals?: number } = {}): string {
  const abs = Math.abs(n);
  const prefix = sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return prefix + '$' + abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtMoneyAShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  if (abs >= 10_000) return sign + '$' + (abs / 1000).toFixed(1) + 'K';
  if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(2) + 'K';
  return sign + '$' + abs.toFixed(0);
}
function fmtRelDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const now = new Date(TODAY + 'T00:00:00');
  const days = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function rangeStartISO(range: RangeKey, series: NWPoint[]): string {
  if (range === 'All' || range === 'Custom' || series.length === 0) {
    return series[0]?.date ?? TODAY;
  }
  const today = new Date(TODAY + 'T00:00:00');
  let days = 30;
  switch (range) {
    case '7D': days = 7; break;
    case '1M': days = 30; break;
    case '3M': days = 90; break;
    case '6M': days = 180; break;
    case '1Y': days = 365; break;
    case '2Y': days = 730; break;
    case 'YTD': {
      const start = new Date(today.getFullYear(), 0, 1);
      return start.toISOString().slice(0, 10);
    }
  }
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  return start.toISOString().slice(0, 10);
}

// ─── Bits ─────────────────────────────────────────────────────────────────
function InstLogo({ institution }: { institution: string | null }) {
  const domain = instDomain(institution);
  const initial = (institution || '?')
    .split(/[\s-*]/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inst-logo">
      {!failed && domain ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={institution || ''}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="fallback">{initial}</span>
      )}
    </span>
  );
}

function Delta({ amount }: { amount: number }) {
  if (amount === 0 || amount == null) return <span className="delta zero num">·</span>;
  const cls = amount > 0 ? 'pos' : 'neg';
  const arrow = amount > 0 ? '▲' : '▼';
  return (
    <span className={'delta ' + cls}>
      <span className="arrow">{arrow}</span>
      <span className="num">{fmtMoneyA(Math.abs(amount), { decimals: 2 })}</span>
    </span>
  );
}

function Sparkline({ points, isLiability }: { points: number[]; isLiability: boolean }) {
  const W = 90, H = 28;
  const minV = Math.min(...points);
  const maxV = Math.max(...points);
  const range = maxV - minV || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - minV) / range) * (H - 4) - 2;
  const linePath = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const areaPath = linePath + ` L${W},${H} L0,${H} Z`;
  const delta = points[points.length - 1]! - points[0]!;
  const cls =
    Math.abs(delta) < 1
      ? 'flat'
      : isLiability
        ? delta > 0 ? 'down' : 'up'
        : delta > 0 ? 'up' : 'down';
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path className={'spark-area ' + cls} d={areaPath} />
      <path className={'spark-line ' + cls} d={linePath} />
    </svg>
  );
}

// ─── Net-worth chart ──────────────────────────────────────────────────────
function NWChart({
  series,
  range,
  onRangeChange,
  customRange,
  onCustomRange,
}: {
  series: NWPoint[];
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  customRange: CustomRange | null;
  onCustomRange: (r: CustomRange) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const filtered = useMemo(() => {
    if (range === 'Custom' && customRange) {
      return series.filter((p) => p.date >= customRange.from && p.date <= customRange.to);
    }
    const startISO = rangeStartISO(range, series);
    return series.filter((p) => p.date >= startISO);
  }, [series, range, customRange]);

  const defaultCustom: CustomRange = useMemo(() => {
    const oldest = series[0]?.date ?? TODAY;
    const fourteenAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return { from: fourteenAgo < oldest ? oldest : fourteenAgo, to: TODAY };
  }, [series]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 220 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const padT = 14, padB = 28, padL = 50, padR = 16;
  const innerW = Math.max(10, W - padL - padR);
  const innerH = Math.max(10, H - padT - padB);

  if (filtered.length < 2) {
    return (
      <section className="card nw-chart-card">
        <div className="nw-chart-hd">
          <div className="nw-chart-hd-l">
            <span className="lbl">Net worth</span>
            <span className="val num-display">
              {fmtMoneyA(series[series.length - 1]?.value ?? 0)}
            </span>
            <span className="change">
              <span>Not enough data in this range</span>
            </span>
          </div>
          <div className="nw-chart-hd-r">
            <div className="range-toggle">
              {RANGES.map((r) => (
                <button
                  type="button"
                  key={r}
                  className={range === r ? 'active' : ''}
                  onClick={() => onRangeChange(r)}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                className={range === 'Custom' ? 'active' : ''}
                onClick={() => {
                  if (range !== 'Custom') {
                    onRangeChange('Custom');
                    if (!customRange) onCustomRange(defaultCustom);
                  }
                  setShowPicker((s) => !s);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
                  <path d="M1.5 5.5h9M4 1.5v2M8 1.5v2" />
                </svg>
                Custom
              </button>
            </div>
          </div>
        </div>
        <div className="nw-empty-state">
          Import more statement history to see the chart over this range.
        </div>
      </section>
    );
  }

  const values = filtered.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range01 = maxV - minV || 1;
  const padPct = 0.08;
  const yMin = minV - range01 * padPct;
  const yMax = maxV + range01 * padPct;

  const x = (i: number) => padL + (i / (filtered.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const linePath = filtered
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
  const areaPath =
    linePath +
    ` L${x(filtered.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const first = filtered[0]!.value;
  const last = filtered[filtered.length - 1]!.value;
  const change = last - first;
  const changePct = first !== 0 ? (change / first) * 100 : 0;
  const changeCls = change > 0 ? 'pos' : change < 0 ? 'neg' : '';
  const changeArrow = change > 0 ? '↗' : change < 0 ? '↘' : '·';

  const rangeLabel: Record<RangeKey, string> = {
    '7D': '7-day change',
    '1M': '1-month change',
    '3M': '3-month change',
    '6M': '6-month change',
    YTD: 'Year-to-date change',
    '1Y': '1-year change',
    '2Y': '2-year change',
    All: 'All-time change',
    Custom: 'Custom range change',
  };

  const yTicks = [
    yMin + (yMax - yMin) * 0.2,
    yMin + (yMax - yMin) * 0.55,
    yMin + (yMax - yMin) * 0.9,
  ];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const idx = Math.round(((xPx - padL) / innerW) * (filtered.length - 1));
    if (idx >= 0 && idx < filtered.length) setHoverIdx(idx);
    else setHoverIdx(null);
  }

  const formatXTick = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    if (range === '1Y' || range === '2Y' || range === 'All') {
      return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const hovered = hoverIdx != null ? filtered[hoverIdx] : null;

  return (
    <section className="card nw-chart-card">
      <div className="nw-chart-hd">
        <div className="nw-chart-hd-l">
          <span className="lbl">Net worth</span>
          <span className="val num-display">{fmtMoneyA(hovered ? hovered.value : last)}</span>
          <span className="change">
            <span className={changeCls}>
              <span className="arrow">{changeArrow}</span>{' '}
              {fmtMoneyA(Math.abs(change), { decimals: 2 })} ({changePct >= 0 ? '+' : ''}
              {changePct.toFixed(1)}%)
            </span>
            <span>{rangeLabel[range]}</span>
          </span>
        </div>
        <div className="nw-chart-hd-r">
          <div className="range-toggle">
            {RANGES.map((r) => (
              <button
                type="button"
                key={r}
                className={range === r ? 'active' : ''}
                onClick={() => {
                  onRangeChange(r);
                  setShowPicker(false);
                }}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              className={range === 'Custom' ? 'active' : ''}
              onClick={() => {
                if (range !== 'Custom') {
                  onRangeChange('Custom');
                  if (!customRange) onCustomRange(defaultCustom);
                }
                setShowPicker((s) => !s);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
                <path d="M1.5 5.5h9M4 1.5v2M8 1.5v2" />
              </svg>
              Custom
            </button>
          </div>
        </div>
      </div>
      {showPicker && range === 'Custom' && (
        <div className="custom-range-popover">
          <div className="row">
            <label>
              From
              <input
                type="date"
                value={(customRange || defaultCustom).from}
                min={series[0]?.date ?? '2000-01-01'}
                max={(customRange || defaultCustom).to}
                onChange={(e) => onCustomRange({ ...(customRange || defaultCustom), from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={(customRange || defaultCustom).to}
                min={(customRange || defaultCustom).from}
                max={TODAY}
                onChange={(e) => onCustomRange({ ...(customRange || defaultCustom), to: e.target.value })}
              />
            </label>
            <button type="button" className="apply" onClick={() => setShowPicker(false)}>
              Done
            </button>
          </div>
        </div>
      )}
      <div className="nw-chart-body" ref={wrapRef}>
        <svg
          className="nw-chart-svg"
          ref={svgRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="nw-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line className="grid" x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} />
              <text className="y-label" x={padL - 8} y={y(v) + 3} textAnchor="end">
                {fmtMoneyAShort(v)}
              </text>
            </g>
          ))}
          <path className="area" d={areaPath} />
          <path className="line" d={linePath} />
          {hovered && hoverIdx != null && (
            <>
              <line
                className="hover-line"
                x1={x(hoverIdx)}
                x2={x(hoverIdx)}
                y1={padT}
                y2={padT + innerH}
              />
              <circle className="hover-dot" cx={x(hoverIdx)} cy={y(hovered.value)} r="4.5" />
            </>
          )}
        </svg>
        {hovered && hoverIdx != null && (
          <div
            className="nw-tooltip"
            style={{
              left: Math.min(W - 160, Math.max(8, x(hoverIdx) - 70)),
              top: Math.max(6, y(hovered.value) - 56),
            }}
          >
            <div className="dt">
              {new Date(hovered.date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </div>
            <div className="vl num">{fmtMoneyA(hovered.value)}</div>
          </div>
        )}
      </div>
      <div className="nw-chart-x">
        <span>{formatXTick(filtered[0]!.date)}</span>
        <span>{formatXTick(filtered[Math.floor(filtered.length / 2)]!.date)}</span>
        <span>{formatXTick(filtered[filtered.length - 1]!.date)}</span>
      </div>
    </section>
  );
}

// ─── Composition bar ──────────────────────────────────────────────────────
function Composition({ accounts }: { accounts: AccountRow[] }) {
  const active = accounts.filter((a) => a.isActive);
  function segmentize(segments: typeof ASSET_SEGMENTS) {
    return segments
      .map((s) => ({
        ...s,
        total: active
          .filter((a) => s.types.includes(a.type))
          .reduce((sum, a) => sum + Math.abs(a.balance), 0),
      }))
      .filter((s) => s.total > 0);
  }
  const assets = segmentize(ASSET_SEGMENTS);
  const liabs = segmentize(LIAB_SEGMENTS);
  const assetsTotal = assets.reduce((s, g) => s + g.total, 0);
  const liabsTotal = liabs.reduce((s, g) => s + g.total, 0);
  const netWorth = assetsTotal - liabsTotal;

  function renderBar(groups: ReturnType<typeof segmentize>, total: number) {
    if (total === 0) return <span style={{ padding: '0 12px', color: 'var(--text-3)', fontSize: 12, alignSelf: 'center' }}>None</span>;
    return groups.map((g) => {
      const pct = (g.total / total) * 100;
      const isTiny = pct < 5;
      const isSmall = !isTiny && pct < 14;
      const cls = 'comp-seg' + (isTiny ? ' tiny' : isSmall ? ' small' : '');
      return (
        <div
          key={g.key}
          className={cls}
          style={{ width: pct + '%', background: g.color }}
          title={`${g.name} · ${fmtMoneyA(g.total)} (${pct.toFixed(1)}%)`}
        >
          {!isTiny && (
            <>
              <span className="seg-name">{g.name}</span>
              <span className="seg-amt num">{fmtMoneyAShort(g.total)}</span>
            </>
          )}
        </div>
      );
    });
  }

  return (
    <section className="card composition">
      <div className="comp-hd">
        <span className="ttl">Composition</span>
        <span className="nw">
          <span className="lbl">Net worth</span>
          {fmtMoneyA(netWorth)}
        </span>
      </div>
      <div className="comp-row">
        <span className="row-lbl">Assets</span>
        <div className="comp-bar">{renderBar(assets, assetsTotal)}</div>
        <span className="row-total num">{fmtMoneyA(assetsTotal)}</span>
      </div>
      <div className="comp-row liab">
        <span className="row-lbl">Liabilities</span>
        <div className="comp-bar">{renderBar(liabs, liabsTotal)}</div>
        <span className="row-total num">{fmtMoneyA(liabsTotal)}</span>
      </div>
    </section>
  );
}

// ─── Row + group ──────────────────────────────────────────────────────────
type CreditCardsAggregate = {
  kind: 'cc-summary';
  cardCount: number;
  totalBalance: number;
  totalLimit: number | null;
  availableCredit: number | null;
  util: number | null;
  delta30: number;
  lastActivity: string | null;
};

function metaPrimaryFor(a: AccountRow): { primary: string; secondary?: string } {
  switch (a.type) {
    case 'loan':
      return {
        primary: a.apr != null ? `${a.apr.toFixed(2)}% APR` : '—',
        secondary: undefined,
      };
    case 'checking':
    case 'savings':
    case 'cash':
      return { primary: a.lastActivity ? fmtRelDate(a.lastActivity) : '—', secondary: undefined };
    case 'brokerage':
    case 'retirement':
      return { primary: a.lastActivity ? fmtRelDate(a.lastActivity) : '—', secondary: undefined };
    default:
      return { primary: '—' };
  }
}

function AccountRowEl({
  a,
  dimmed,
  onClick,
  onClose,
  onReopen,
  busy,
}: {
  a: AccountRow;
  dimmed?: boolean;
  onClick?: () => void;
  onClose?: (id: string) => void;
  onReopen?: (id: string) => void;
  busy?: boolean;
}) {
  const meta = TYPE_META[a.type];
  const m = metaPrimaryFor(a);
  const isLiab = !meta.asset;
  return (
    <div
      className={'v1-row' + (isLiab ? ' liability' : '') + (dimmed ? ' dimmed' : '')}
      onClick={onClick}
    >
      <span className="spacer" />
      <InstLogo institution={a.institution} />
      <div className="name">
        <span className="n">{a.name}</span>
        <span className="sub">
          <b>{a.institution || '—'}</b>
          {a.last4 && <> · ····{a.last4}</>}
          {a.lastActivity && <> · {fmtRelDate(a.lastActivity)}</>}
        </span>
      </div>
      <div className="meta">
        <b>{m.primary}</b>
        {m.secondary && <span>{m.secondary}</span>}
      </div>
      <div className="spark-col">
        <Sparkline points={a.sparkline} isLiability={isLiab} />
      </div>
      <div className="delta-col">
        <Delta amount={a.delta30} />
      </div>
      <div className="bal num">{fmtMoneyA(Math.abs(a.balance))}</div>
      <div className="row-actions">
        {a.isActive ? (
          <button
            type="button"
            className="row-action-btn danger"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onClose?.(a.id);
            }}
            title="Mark as closed"
            aria-label="Mark as closed"
          >
            ×
          </button>
        ) : (
          <button
            type="button"
            className="row-action-btn"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onReopen?.(a.id);
            }}
            title="Re-open"
            aria-label="Re-open"
          >
            ↻
          </button>
        )}
      </div>
    </div>
  );
}

function CreditCardsAggregateRow({ s }: { s: CreditCardsAggregate }) {
  return (
    <Link href="/credit-cards" className="v1-row liability linkable">
      <span className="spacer" />
      <InstLogo institution={`${s.cardCount} cards`} />
      <div className="name">
        <span className="n">Credit cards</span>
        <span className="sub">
          <b>{s.cardCount} {s.cardCount === 1 ? 'card' : 'cards'}</b>
          {s.totalLimit != null && (
            <> · {fmtMoneyAShort(s.availableCredit ?? 0)} avail</>
          )}
          {s.lastActivity && <> · {fmtRelDate(s.lastActivity)}</>}
        </span>
      </div>
      <div className="meta">
        <b>{s.util != null ? s.util.toFixed(1) + '% util' : '—'}</b>
        {s.totalLimit != null && <span>of {fmtMoneyAShort(s.totalLimit)}</span>}
      </div>
      <div className="spark-col" />
      <div className="delta-col">
        <Delta amount={s.delta30} />
      </div>
      <div className="bal num">{fmtMoneyA(Math.abs(s.totalBalance))}</div>
      <div className="row-actions" />
    </Link>
  );
}

// ─── Grid view card ───────────────────────────────────────────────────────
function AccountCard({
  a,
  isLiab,
  isDragging,
  dropEdge,
  dimmed,
  busy,
  onClick,
  onClose,
  onReopen,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  a: AccountRow;
  isLiab: boolean;
  isDragging?: boolean;
  dropEdge?: 'before' | 'after' | null;
  dimmed?: boolean;
  busy?: boolean;
  onClick?: () => void;
  onClose?: (id: string) => void;
  onReopen?: (id: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const m = metaPrimaryFor(a);
  const cls =
    'gv-card' +
    (isLiab ? ' liability' : '') +
    (isDragging ? ' dragging' : '') +
    (dimmed ? ' dimmed' : '') +
    (dropEdge === 'before' ? ' drop-before' : '') +
    (dropEdge === 'after' ? ' drop-after' : '');
  return (
    <div
      className={cls}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {a.isActive && onClose && (
        <button
          type="button"
          className="gv-row-action danger"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onClose(a.id);
          }}
          title="Mark as closed"
          aria-label="Mark as closed"
        >×</button>
      )}
      {!a.isActive && onReopen && (
        <button
          type="button"
          className="gv-row-action"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onReopen(a.id);
          }}
          title="Re-open"
          aria-label="Re-open"
        >↻</button>
      )}
      <div className="gv-top">
        <InstLogo institution={a.institution} />
        <div className="gv-id">
          <div className="gv-name">{a.name}</div>
          <div className="gv-sub">
            {a.institution}{a.last4 ? ` · ····${a.last4}` : ''}
          </div>
        </div>
      </div>
      <div className="gv-bal-row">
        <span className="gv-bal num-display">{fmtMoneyA(Math.abs(a.balance))}</span>
        <Delta amount={a.delta30} />
      </div>
      <div className="gv-spark">
        <Sparkline points={a.sparkline} isLiability={isLiab} />
      </div>
      <div className="gv-foot">
        <span className="gv-meta">
          <b>{m.primary}</b>
          {m.secondary ? ` ${m.secondary}` : ''}
        </span>
        <span>{fmtRelDate(a.lastActivity)}</span>
      </div>
    </div>
  );
}

function CreditCardsAggregateCard({ s }: { s: CreditCardsAggregate }) {
  return (
    <Link href="/credit-cards" className="gv-card liability linkable pinned" draggable={false}>
      <div className="gv-top">
        <InstLogo institution={`${s.cardCount} cards`} />
        <div className="gv-id">
          <div className="gv-name">Credit cards</div>
          <div className="gv-sub">
            {s.cardCount} {s.cardCount === 1 ? 'card' : 'cards'}
            {s.totalLimit != null ? ` · ${fmtMoneyAShort(s.availableCredit ?? 0)} avail` : ''}
          </div>
        </div>
      </div>
      <div className="gv-bal-row">
        <span className="gv-bal num-display">{fmtMoneyA(Math.abs(s.totalBalance))}</span>
        <Delta amount={s.delta30} />
      </div>
      <div className="gv-foot">
        <span className="gv-meta">
          <b>{s.util != null ? `${s.util.toFixed(1)}% util` : '—'}</b>
        </span>
        <span>{fmtRelDate(s.lastActivity)}</span>
      </div>
    </Link>
  );
}

// ─── Add account flow (Monarch-style: category → form) ────────────────────
type CategoryId = 'banks-cards' | 'investments-loans' | 'other';

const ACCOUNT_CATEGORIES: {
  id: CategoryId;
  label: string;
  description: string;
  iconClass: string;
  types: AccountType[];
}[] = [
  {
    id: 'banks-cards',
    label: 'Banks & credit cards',
    description: 'Checking, savings, cash, credit cards',
    iconClass: 'blue',
    types: ['checking', 'savings', 'cash', 'credit_card'],
  },
  {
    id: 'investments-loans',
    label: 'Investments & loans',
    description: 'Brokerage, retirement, loans',
    iconClass: 'purple',
    types: ['brokerage', 'retirement', 'loan'],
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Anything else — real estate, crypto, custom',
    iconClass: 'slate',
    types: ['other'],
  },
];

function categoryCount(catId: CategoryId, accounts: AccountRow[]): number {
  const cat = ACCOUNT_CATEGORIES.find((c) => c.id === catId);
  if (!cat) return 0;
  return accounts.filter((a) => cat.types.includes(a.type)).length;
}

function AddAccountCategoryPicker({
  accounts,
  onPick,
  onClose,
}: {
  accounts: AccountRow[];
  onPick: (cat: (typeof ACCOUNT_CATEGORIES)[number]) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div
          className="cc-modal"
          onClick={(e) => e.stopPropagation()}
          style={{ width: 'min(480px, calc(100vw - 32px))' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Add an account</h2>
            <button
              type="button"
              className="cc-detail-modal-close"
              onClick={onClose}
              aria-label="Close"
            >×</button>
          </div>
          <div className="add-cat-list">
            {ACCOUNT_CATEGORIES.map((cat) => {
              const count = categoryCount(cat.id, accounts);
              return (
                <button
                  key={cat.id}
                  type="button"
                  className="add-cat-row"
                  onClick={() => onPick(cat)}
                >
                  <span className={'add-cat-icon ' + cat.iconClass}>
                    {cat.id === 'banks-cards' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 10l9-6 9 6"/>
                        <path d="M5 10v8M9 10v8M15 10v8M19 10v8"/>
                        <path d="M3 19h18"/>
                      </svg>
                    )}
                    {cat.id === 'investments-loans' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 17l6-6 4 4 8-8"/>
                        <path d="M14 7h7v7"/>
                      </svg>
                    )}
                    {cat.id === 'other' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="6" cy="12" r="1.5"/>
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="18" cy="12" r="1.5"/>
                      </svg>
                    )}
                  </span>
                  <span className="add-cat-text">
                    <span className="label">{cat.label}</span>
                    <span className="sub">
                      {count > 0 ? `${count} added · ` : ''}
                      {cat.description}
                    </span>
                  </span>
                  <span className="add-cat-arrow">›</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddAccountForm({
  category,
  onBack,
  onClose,
  onCreated,
}: {
  category: (typeof ACCOUNT_CATEGORIES)[number];
  onBack: () => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>(category.types[0]!);
  const [institution, setInstitution] = useState('');
  const [last4, setLast4] = useState('');
  const [openedAt, setOpenedAt] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [apr, setApr] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isCard = type === 'credit_card';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      type,
    };
    if (institution.trim()) body.institution = institution.trim();
    if (last4.trim()) body.accountNumber = last4.trim();
    if (openedAt) body.openedAt = openedAt;
    if (isCard && creditLimit.trim()) {
      const n = Number(creditLimit.replace(/[$,]/g, ''));
      if (Number.isNaN(n) || n < 0) {
        setSaving(false);
        setError('Credit limit must be a non-negative number.');
        return;
      }
      body.creditLimit = n;
    }
    if (isCard && apr.trim()) {
      const n = Number(apr.replace(/[%]/g, ''));
      if (Number.isNaN(n) || n < 0 || n > 100) {
        setSaving(false);
        setError('APR must be between 0 and 100.');
        return;
      }
      body.apr = n;
    }
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok || json.error) {
        setError(json?.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      onCreated();
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  const typeLabel: Record<AccountType, string> = {
    checking: 'Checking', savings: 'Savings', cash: 'Cash',
    credit_card: 'Credit card', brokerage: 'Brokerage',
    retirement: 'Retirement', loan: 'Loan', other: 'Other',
  };

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <form className="cc-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="add-back-btn" onClick={onBack}>‹ Back</button>
            <h2 style={{ flex: 1, textAlign: 'center', margin: 0 }}>{category.label}</h2>
            <button
              type="button"
              className="cc-detail-modal-close"
              onClick={onClose}
              aria-label="Close"
            >×</button>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ally Online Savings"
              maxLength={120}
              autoFocus
              required
            />
          </label>
          {category.types.length > 1 && (
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {category.types.map((t) => (
                  <option key={t} value={t}>{typeLabel[t]}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Institution
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. Ally Bank"
              maxLength={120}
            />
          </label>
          <div className="row-2">
            <label>
              Last 4
              <input
                type="text"
                value={last4}
                onChange={(e) => setLast4(e.target.value)}
                placeholder="1234"
                inputMode="numeric"
                maxLength={8}
              />
            </label>
            <label>
              Opened
              <input
                type="date"
                value={openedAt}
                onChange={(e) => setOpenedAt(e.target.value)}
                max={TODAY}
              />
            </label>
          </div>
          {isCard && (
            <div className="row-2">
              <label>
                Credit limit
                <input
                  type="text"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="5000"
                  inputMode="decimal"
                />
              </label>
              <label>
                APR (%)
                <input
                  type="text"
                  value={apr}
                  onChange={(e) => setApr(e.target.value)}
                  placeholder="19.99"
                  inputMode="decimal"
                />
              </label>
            </div>
          )}
          <div className="actions">
            <button type="button" className="pg-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="pg-btn primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAccountFlow({
  accounts,
  onClose,
  onCreated,
}: {
  accounts: AccountRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<(typeof ACCOUNT_CATEGORIES)[number] | null>(null);
  if (!category) {
    return (
      <AddAccountCategoryPicker
        accounts={accounts}
        onPick={setCategory}
        onClose={onClose}
      />
    );
  }
  return (
    <AddAccountForm
      category={category}
      onBack={() => setCategory(null)}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

// PATCH helper for marking closed / re-opening / inline edits
type PatchResult = { ok: true } | { ok: false; error: string };
async function patchAccount(id: string, body: Record<string, unknown>): Promise<PatchResult> {
  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

// ─── Sort options (shared by list + grid in both tabs) ────────────────────
const SORT_OPTIONS = [
  { id: 'manual', label: 'Manual (drag to reorder)' },
  { id: 'balance-desc', label: 'Balance · high → low' },
  { id: 'balance-asc', label: 'Balance · low → high' },
  { id: 'name', label: 'Name (A→Z)' },
  { id: 'recent', label: 'Last activity · most recent' },
  { id: 'delta', label: '30-day change · most movement' },
] as const;
type SortId = (typeof SORT_OPTIONS)[number]['id'];

function sortRowsBy(rows: AccountRow[], sortBy: SortId): AccountRow[] {
  if (sortBy === 'manual') return rows; // caller applies manual order separately
  const out = [...rows];
  switch (sortBy) {
    case 'balance-desc':
      out.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
      break;
    case 'balance-asc':
      out.sort((a, b) => Math.abs(a.balance) - Math.abs(b.balance));
      break;
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent':
      out.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
      break;
    case 'delta':
      out.sort((a, b) => Math.abs(b.delta30) - Math.abs(a.delta30));
      break;
  }
  return out;
}

// ─── Editable field used in the asset detail modal ────────────────────────
function EditableField({
  label,
  display,
  isPlaceholder,
  initialValue,
  inputType,
  max,
  onSave,
}: {
  label: string;
  display: string;
  isPlaceholder?: boolean;
  initialValue: string;
  inputType: 'text' | 'date' | 'number';
  max?: string;
  onSave: (raw: string) => Promise<PatchResult>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputType !== 'date') inputRef.current.select();
    }
  }, [editing, inputType]);
  useEffect(() => {
    if (!editing) setDraft(initialValue);
  }, [editing, initialValue]);

  function start() {
    setDraft(initialValue);
    setError(null);
    setEditing(true);
  }
  function cancel() {
    setDraft(initialValue);
    setError(null);
    setEditing(false);
  }
  async function commit() {
    setSaving(true);
    const r = await onSave(draft);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="drawer-stat is-editable" style={{ background: 'var(--surface-elev)', padding: '12px 14px', borderRadius: 11 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
        <input
          ref={inputRef}
          className="edit-input"
          type={inputType}
          max={max}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') cancel();
          }}
          onBlur={() => setTimeout(() => editing && commit(), 50)}
          style={{
            appearance: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--text-2)',
            borderRadius: 6,
            padding: '4px 8px',
            marginTop: 4,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-1)',
            fontFamily: 'inherit',
            outline: 'none',
            width: '100%',
            minWidth: 0,
          }}
        />
        {error && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--red-text)', lineHeight: 1.3 }}>{error}</div>}
      </div>
    );
  }
  return (
    <div
      className="drawer-stat is-editable"
      onClick={start}
      title="Click to edit"
      style={{ background: 'var(--surface-elev)', padding: '12px 14px', borderRadius: 11, cursor: 'text', transition: 'background 120ms ease', display: 'flex', flexDirection: 'column' }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: isPlaceholder ? 'var(--text-3)' : 'var(--text-1)',
          fontStyle: isPlaceholder ? 'italic' : 'normal',
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </span>
    </div>
  );
}

// ─── Asset detail modal ───────────────────────────────────────────────────
function AccountDetailModal({
  account,
  onClose,
  onUpdated,
}: {
  account: AccountRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const isLiab = !TYPE_META[account.type].asset;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleClose() {
    if (!confirm(`Mark "${account.name}" as closed? It'll move to the Closed tab.`)) return;
    setClosing(true);
    const r = await patchAccount(account.id, { isActive: false });
    setClosing(false);
    if (!r.ok) alert(r.error);
    else { onUpdated(); onClose(); }
  }
  async function handleReopen() {
    setClosing(true);
    const r = await patchAccount(account.id, { isActive: true });
    setClosing(false);
    if (!r.ok) alert(r.error);
    else { onUpdated(); onClose(); }
  }

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <div
          className="cc-detail-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${account.name} details`}
        >
          <div className="cc-detail-modal-header">
            <InstLogo institution={account.institution} />
            <div className="cc-detail-modal-title">
              <h2>{account.name}</h2>
              <p>
                {TYPE_META[account.type].label}
                {account.institution ? ` · ${account.institution}` : ''}
                {account.last4 ? ` · •••• ${account.last4}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="cc-detail-modal-close"
              onClick={onClose}
              aria-label="Close"
            >×</button>
          </div>
          <div className="cc-detail-modal-body">
            {/* Top stats: balance + delta + last activity */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
              <div style={{ padding: '12px 14px', background: 'var(--surface-elev)', borderRadius: 11 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Current balance</span>
                <div style={{ fontSize: 22, fontWeight: 700, color: isLiab ? 'var(--red-text)' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 4, letterSpacing: '-0.02em' }}>
                  {fmtMoneyA(Math.abs(account.balance))}
                </div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--surface-elev)', borderRadius: 11 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>30-day change</span>
                <div style={{ marginTop: 6 }}><Delta amount={account.delta30} /></div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--surface-elev)', borderRadius: 11 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Last activity</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', marginTop: 6 }}>
                  {fmtRelDate(account.lastActivity)}
                </div>
              </div>
            </div>

            {/* 12-week sparkline as a larger chart */}
            <div style={{ padding: '14px 16px', background: 'var(--surface-elev)', borderRadius: 11, marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Balance · last 12 weeks</span>
              <div style={{ marginTop: 8, height: 72 }}>
                <svg viewBox="0 0 600 72" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                  {(() => {
                    const pts = account.sparkline;
                    const minV = Math.min(...pts);
                    const maxV = Math.max(...pts);
                    const range = maxV - minV || 1;
                    const x = (i: number) => (i / (pts.length - 1)) * 600;
                    const y = (v: number) => 72 - ((v - minV) / range) * (72 - 8) - 4;
                    const linePath = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
                    const areaPath = linePath + ` L600,72 L0,72 Z`;
                    const delta = pts[pts.length - 1]! - pts[0]!;
                    const cls = Math.abs(delta) < 1 ? 'flat' : isLiab ? (delta > 0 ? 'down' : 'up') : (delta > 0 ? 'up' : 'down');
                    return (
                      <g className="spark">
                        <path className={'spark-area ' + cls} d={areaPath} />
                        <path className={'spark-line ' + cls} d={linePath} style={{ strokeWidth: 1.8 }} />
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Editable account details */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', padding: '4px 2px 10px' }}>
                Account info
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <EditableField
                  label="Account name"
                  display={account.name}
                  initialValue={account.name}
                  inputType="text"
                  onSave={async (raw) => {
                    const trimmed = raw.trim();
                    if (!trimmed) return { ok: false, error: 'Name cannot be empty.' };
                    const r = await patchAccount(account.id, { name: trimmed });
                    if (r.ok) onUpdated();
                    return r;
                  }}
                />
                <EditableField
                  label="Institution"
                  display={account.institution || 'Click to set'}
                  isPlaceholder={!account.institution}
                  initialValue={account.institution}
                  inputType="text"
                  onSave={async (raw) => {
                    const r = await patchAccount(account.id, { institution: raw.trim() || null });
                    if (r.ok) onUpdated();
                    return r;
                  }}
                />
                <EditableField
                  label="Last 4"
                  display={account.last4 || 'Click to set'}
                  isPlaceholder={!account.last4}
                  initialValue={account.last4}
                  inputType="text"
                  onSave={async (raw) => {
                    const r = await patchAccount(account.id, { accountNumber: raw.trim() || null });
                    if (r.ok) onUpdated();
                    return r;
                  }}
                />
                <EditableField
                  label="Opened"
                  display={account.openedDate ? fmtRelDate(account.openedDate) : 'Click to set'}
                  isPlaceholder={!account.openedDate}
                  initialValue={account.openedDate ?? ''}
                  inputType="date"
                  max={account.earliestTxnDate ?? TODAY}
                  onSave={async (raw) => {
                    const trimmed = raw.trim();
                    if (!trimmed) {
                      const r = await patchAccount(account.id, { openedAt: null });
                      if (r.ok) onUpdated();
                      return r;
                    }
                    const r = await patchAccount(account.id, { openedAt: trimmed });
                    if (r.ok) onUpdated();
                    return r;
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              {account.isActive ? (
                <button
                  type="button"
                  className="pg-btn"
                  disabled={closing}
                  onClick={handleClose}
                  style={{
                    color: 'var(--red-text)',
                    borderColor: 'color-mix(in srgb, var(--red) 35%, transparent)',
                  }}
                >
                  {closing ? 'Closing…' : 'Mark as closed'}
                </button>
              ) : (
                <button
                  type="button"
                  className="pg-btn"
                  disabled={closing}
                  onClick={handleReopen}
                >
                  {closing ? 'Re-opening…' : 'Re-open'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────
export function AccountsClient({
  accounts,
  nwSeries,
}: {
  accounts: AccountRow[];
  nwSeries: NWPoint[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [range, setRange] = useState<RangeKey>('1M');
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<GroupName, boolean>>({
    Cash: true,
    Investments: true,
    Liabilities: true,
    Other: true,
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortId>('manual');
  // Per-bucket manual order (grid view drag-and-drop). Key is subgroup name
  // (or group name when the group has no subgroups, like Cash). Value is an
  // array of account ids in user's preferred order.
  const [accountOrders, setAccountOrders] = useState<Record<string, string[]>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingBucket, setDraggingBucket] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('accounts:order');
      if (raw) setAccountOrders(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('accounts:order', JSON.stringify(accountOrders));
    } catch { /* ignore */ }
  }, [accountOrders]);

  const activeAccounts = accounts.filter((a) => a.isActive);
  const closedAccounts = accounts.filter((a) => !a.isActive);
  // What's visible in the active tab: active accounts; if showHidden, mix in closed too.
  const activeVisible = showHidden ? accounts : activeAccounts;
  const visible = tab === 'closed' ? closedAccounts : activeVisible;

  // Credit-cards aggregate row (only includes the cards that are "visible"
  // given the current tab + showHidden choice)
  const ccAggregate = useMemo<CreditCardsAggregate | null>(() => {
    const cards = visible.filter((a) => a.type === 'credit_card');
    if (cards.length === 0) return null;
    const totalBalance = cards.reduce((s, c) => s + c.balance, 0);
    const limits = cards.map((c) => c.creditLimit).filter((x): x is number => x != null);
    const totalLimit = limits.length === cards.length ? limits.reduce((s, n) => s + n, 0) : null;
    const availableCredit = totalLimit != null ? totalLimit + totalBalance : null;
    const util = totalLimit != null && totalLimit > 0 ? (-totalBalance / totalLimit) * 100 : null;
    const delta30 = cards.reduce((s, c) => s + c.delta30, 0);
    const lastActivity =
      cards
        .map((c) => c.lastActivity)
        .filter((x): x is string => x != null)
        .sort()
        .pop() ?? null;
    return {
      kind: 'cc-summary',
      cardCount: cards.length,
      totalBalance, totalLimit, availableCredit, util,
      delta30, lastActivity,
    };
  }, [visible]);

  // Bucket non-credit-card accounts into groups
  const grouped = useMemo(() => {
    const result: Record<GroupName, AccountRow[]> = {
      Cash: [], Investments: [], Liabilities: [], Other: [],
    };
    for (const a of visible) {
      if (a.type === 'credit_card') continue;
      const g = TYPE_META[a.type].group;
      result[g].push(a);
    }
    return result;
  }, [visible]);

  async function handleClose(id: string) {
    const acct = accounts.find((a) => a.id === id);
    const label = acct ? acct.name : 'this account';
    if (!confirm(`Mark "${label}" as closed? You can re-open it later.`)) return;
    setBusyId(id);
    const r = await patchAccount(id, { isActive: false });
    setBusyId(null);
    if (!r.ok) alert(r.error);
    else router.refresh();
  }
  async function handleReopen(id: string) {
    setBusyId(id);
    const r = await patchAccount(id, { isActive: true });
    setBusyId(null);
    if (!r.ok) alert(r.error);
    else router.refresh();
  }

  // Order a bucket's rows by manual order if present, else alphabetical.
  function orderRows(bucketKey: string, rows: AccountRow[]): AccountRow[] {
    const order = accountOrders[bucketKey];
    if (!order || order.length === 0) return rows;
    const idx = new Map(order.map((id, i) => [id, i]));
    return [...rows].sort((a, b) => {
      const ai = idx.get(a.id);
      const bi = idx.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  // ── Drag-and-drop within a single bucket (grid view only) ───────────────
  function onCardDragStart(e: React.DragEvent, id: string, bucketKey: string) {
    setDraggingId(id);
    setDraggingBucket(bucketKey);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  }
  function onCardDragOver(e: React.DragEvent, id: string, bucketKey: string) {
    if (!draggingId || id === draggingId) return;
    if (draggingBucket !== bucketKey) return; // only allow drop within same bucket
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    setDropTarget((cur) =>
      cur && cur.id === id && cur.edge === edge ? cur : { id, edge },
    );
  }
  function onCardDrop(
    e: React.DragEvent,
    targetId: string,
    bucketKey: string,
    bucketRows: AccountRow[],
  ) {
    e.preventDefault();
    const sourceId = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDraggingBucket(null);
    setDropTarget(null);
    if (!sourceId || sourceId === targetId || !target || draggingBucket !== bucketKey) return;

    const visibleIds = bucketRows.map((r) => r.id);
    const next = [...visibleIds];
    const sourceIdx = next.indexOf(sourceId);
    let targetIdx = next.indexOf(target.id);
    if (sourceIdx === -1 || targetIdx === -1) return;
    next.splice(sourceIdx, 1);
    if (sourceIdx < targetIdx) targetIdx -= 1;
    const insertAt = target.edge === 'before' ? targetIdx : targetIdx + 1;
    next.splice(insertAt, 0, sourceId);

    setAccountOrders((prev) => ({ ...prev, [bucketKey]: next }));
  }
  function onCardDragEnd() {
    setDraggingId(null);
    setDraggingBucket(null);
    setDropTarget(null);
  }

  function subgroupBuckets(rows: AccountRow[], groupName: GroupName, includeCc: boolean) {
    const order = SUBGROUP_ORDER[groupName];
    if (!order) {
      return [{
        name: null as string | null,
        rows,
        total: rows.reduce((s, r) => s + r.balance, 0),
        isCcAggregate: false,
      }];
    }
    const buckets: Record<string, AccountRow[]> = {};
    for (const r of rows) {
      const sg = TYPE_META[r.type].subgroup;
      if (!sg) continue;
      (buckets[sg] ??= []).push(r);
    }
    // For Liabilities, add the credit-cards aggregate as a sub-bucket
    const out = order
      .filter((sg) => {
        if (sg === 'Credit cards' && includeCc && ccAggregate) return true;
        return (buckets[sg]?.length ?? 0) > 0;
      })
      .map((sg) => {
        if (sg === 'Credit cards' && includeCc && ccAggregate) {
          return {
            name: sg,
            rows: [] as AccountRow[],
            total: ccAggregate.totalBalance,
            isCcAggregate: true,
          };
        }
        const rows = buckets[sg] ?? [];
        return {
          name: sg,
          rows,
          total: rows.reduce((s, r) => s + r.balance, 0),
          isCcAggregate: false,
        };
      });
    return out;
  }

  function groupTotal(g: GroupName): number {
    const rows = grouped[g];
    let total = rows.reduce((s, r) => s + r.balance, 0);
    if (g === 'Liabilities' && ccAggregate) total += ccAggregate.totalBalance;
    return total;
  }
  function groupDelta(g: GroupName): number {
    const rows = grouped[g];
    let total = rows.reduce((s, r) => s + r.delta30, 0);
    if (g === 'Liabilities' && ccAggregate) total += ccAggregate.delta30;
    return total;
  }
  function groupCount(g: GroupName): number {
    let count = grouped[g].length;
    if (g === 'Liabilities' && ccAggregate) count += 1; // aggregate counts as one row
    return count;
  }

  return (
    <>
      <header className="page-hd">
        <div>
          <h1 className="page-title">Accounts</h1>
        </div>
        <div className="page-actions">
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-3)',
            }}
          >
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortId)}
              style={{
                appearance: 'none',
                background: 'transparent',
                border: '1px solid var(--line-strong)',
                color: 'var(--text-1)',
                padding: '5px 26px 5px 11px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none' stroke='%238b8278' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2 4l3 3 3-3'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 9px center',
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <div className="view-toggle" role="tablist" aria-label="View">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'grid'}
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="2" y="2" width="4" height="4" rx="0.8" />
                <rect x="8" y="2" width="4" height="4" rx="0.8" />
                <rect x="2" y="8" width="4" height="4" rx="0.8" />
                <rect x="8" y="8" width="4" height="4" rx="0.8" />
              </svg>
              Grid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2 4h10M2 7h10M2 10h10" />
              </svg>
              List
            </button>
          </div>
          <button type="button" className="pg-btn primary" onClick={() => setShowAdd(true)}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
            Add account
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={'tab' + (tab === 'active' ? ' active' : '')}
          onClick={() => setTab('active')}
        >
          Active <span className="count num">{activeAccounts.length}</span>
        </button>
        <button
          type="button"
          className={'tab' + (tab === 'closed' ? ' active' : '')}
          onClick={() => setTab('closed')}
        >
          Closed <span className="count num">{closedAccounts.length}</span>
        </button>
      </nav>

      <div className="v1plus-layout">
        <div className="v1plus-main">
          {tab === 'active' && (
            <>
              <NWChart
                series={nwSeries}
                range={range}
                onRangeChange={setRange}
                customRange={customRange}
                onCustomRange={setCustomRange}
              />
              <Composition accounts={accounts} />
            </>
          )}

          {tab === 'closed' && visible.length === 0 && (
            <div className="card closed-state" style={{ marginTop: 16 }}>
              No closed accounts.
            </div>
          )}

          <div>
            {GROUP_ORDER.map((g) => {
              const rows = grouped[g];
              const includeCc = g === 'Liabilities' && ccAggregate != null;
              if (rows.length === 0 && !includeCc) return null;
              const total = groupTotal(g);
              const delta = groupDelta(g);
              const count = groupCount(g);
              const isOpen = openGroups[g];
              const isLiab = g === 'Liabilities';
              const buckets = subgroupBuckets(rows, g, includeCc);

              if (view === 'grid') {
                return (
                  <section
                    key={g}
                    className={'gv-section' + (isOpen ? ' open' : '') + (isLiab ? ' liabilities' : '')}
                  >
                    <div
                      className="gv-section-hd"
                      onClick={() => setOpenGroups((s) => ({ ...s, [g]: !s[g] }))}
                    >
                      <span className="caret">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 1.5L7 5l-3.5 3.5" />
                        </svg>
                      </span>
                      <span className="ttl">
                        {g}
                        <span className="n">
                          {count} {count === 1 ? 'account' : 'accounts'}
                        </span>
                      </span>
                      <span className="delta-col">
                        <Delta amount={delta} />
                      </span>
                      <span className="bal num">{fmtMoneyA(Math.abs(total))}</span>
                    </div>
                    <div className="gv-section-body">
                      {buckets.map((sub) => {
                        const bucketKey = sub.name ?? g;
                        const orderedRows = sortRowsBy(orderRows(bucketKey, sub.rows), sortBy);
                        return (
                          <div key={sub.name ?? '_flat'}>
                            {sub.name && (
                              <div className="gv-sub-hd">
                                <span className="ttl">
                                  {sub.name}
                                  <span className="n">
                                    {sub.isCcAggregate
                                      ? `${ccAggregate?.cardCount ?? 0} cards`
                                      : `${sub.rows.length} ${sub.rows.length === 1 ? 'account' : 'accounts'}`}
                                  </span>
                                </span>
                                <span className="total num">{fmtMoneyA(Math.abs(sub.total))}</span>
                              </div>
                            )}
                            <div className="gv-grid">
                              {sub.isCcAggregate && ccAggregate ? (
                                <CreditCardsAggregateCard s={ccAggregate} />
                              ) : (
                                orderedRows.map((a) => (
                                  <AccountCard
                                    key={a.id}
                                    a={a}
                                    isLiab={isLiab}
                                    dimmed={!a.isActive}
                                    busy={busyId === a.id}
                                    isDragging={draggingId === a.id}
                                    dropEdge={dropTarget?.id === a.id ? dropTarget.edge : null}
                                    onClick={() => setDetailId(a.id)}
                                    onClose={handleClose}
                                    onReopen={handleReopen}
                                    onDragStart={(e) => onCardDragStart(e, a.id, bucketKey)}
                                    onDragOver={(e) => onCardDragOver(e, a.id, bucketKey)}
                                    onDrop={(e) => onCardDrop(e, a.id, bucketKey, orderedRows)}
                                    onDragEnd={onCardDragEnd}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              }

              return (
                <div
                  key={g}
                  className={'v1-group' + (isOpen ? ' open' : '') + (isLiab ? ' liabilities' : '')}
                >
                  <div
                    className="v1-group-hd"
                    onClick={() => setOpenGroups((s) => ({ ...s, [g]: !s[g] }))}
                  >
                    <span className="caret">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3.5 1.5L7 5l-3.5 3.5" />
                      </svg>
                    </span>
                    <span className="ttl">
                      {g}
                      <span className="n">
                        {count} {count === 1 ? 'account' : 'accounts'}
                      </span>
                    </span>
                    <span className="delta-col">
                      <Delta amount={delta} />
                    </span>
                    <span className="bal num">{fmtMoneyA(Math.abs(total))}</span>
                  </div>
                  <div className="v1-group-rows">
                    {buckets.map((sub) => (
                      <div key={sub.name ?? '_flat'}>
                        {sub.name && (
                          <div className="v1-subgroup-hd">
                            <span />
                            <span className="ttl">
                              {sub.name}
                              <span className="n">
                                {sub.isCcAggregate
                                  ? `${ccAggregate?.cardCount ?? 0} cards`
                                  : `${sub.rows.length} ${sub.rows.length === 1 ? 'account' : 'accounts'}`}
                              </span>
                            </span>
                            <span className="bal num">{fmtMoneyA(Math.abs(sub.total))}</span>
                          </div>
                        )}
                        {sub.isCcAggregate && ccAggregate ? (
                          <CreditCardsAggregateRow s={ccAggregate} />
                        ) : (
                          sortRowsBy(orderRows(sub.name ?? g, sub.rows), sortBy).map((a) => (
                            <AccountRowEl
                              key={a.id}
                              a={a}
                              dimmed={!a.isActive}
                              onClick={() => setDetailId(a.id)}
                              onClose={handleClose}
                              onReopen={handleReopen}
                              busy={busyId === a.id}
                            />
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {tab === 'active' && closedAccounts.length > 0 && (
            <div className="hidden-accounts-toggle">
              <button type="button" onClick={() => setShowHidden((s) => !s)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" />
                  <circle cx="6" cy="6" r="1.5" />
                </svg>
                {showHidden ? 'Hide' : 'Show'} {closedAccounts.length} closed{' '}
                {closedAccounts.length === 1 ? 'account' : 'accounts'}
              </button>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddAccountFlow
          accounts={accounts}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            router.refresh();
          }}
        />
      )}

      {detailId && (() => {
        const acct = accounts.find((a) => a.id === detailId);
        if (!acct) return null;
        return (
          <AccountDetailModal
            account={acct}
            onClose={() => setDetailId(null)}
            onUpdated={() => router.refresh()}
          />
        );
      })()}
    </>
  );
}
