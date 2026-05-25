'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  computeYTD,
  depositsByBankYTD,
  deriveEvents,
  prettyLabel,
  stubYears,
  fmtMoney,
  fmtMoneyParts,
  fmtDate,
  fmtDateShort,
  fmtMonth,
  type LineItem,
  type PayrollEvent,
  type Stub,
} from '@/lib/payroll/data';

// ─── Theme tracker (donut needs explicit hex to bypass Dark Reader) ────────
type Theme = 'light' | 'dark';
function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    const html = document.documentElement;
    const update = () => {
      setTheme(html.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// ─── Primitives ───────────────────────────────────────────────────────────
function LineRow({
  label,
  meta,
  amount,
  subtotal,
}: {
  label: string;
  meta?: string;
  amount: number;
  subtotal?: boolean;
}) {
  return (
    <div className={'line-row' + (subtotal ? ' subtotal' : '')}>
      <div className="lbl">{label}</div>
      <div className="meta num">{meta}</div>
      <div className="amt num">{fmtMoney(amount)}</div>
    </div>
  );
}

function SectionHd({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="line-section-hd">
      <div className="eyebrow">{title}</div>
      {meta && (
        <div className="meta" style={{ color: 'var(--text-3)', fontSize: 12 }}>
          {meta}
        </div>
      )}
    </div>
  );
}

// Render a list of parser-extracted line items (label prettified, amount right).
function ItemRows({ items }: { items: LineItem[] }) {
  return (
    <>
      {items.map((li, i) => (
        <LineRow key={`${li.label}-${i}`} label={prettyLabel(li.label)} amount={li.amount} />
      ))}
    </>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────
const DONUT_COLORS = {
  light: { green: '#16a34a', blue: '#2563eb', red: '#dc2626', track: 'rgba(0,0,0,0.06)' },
  dark:  { green: '#4ade80', blue: '#60a5fa', red: '#f87171', track: 'rgba(255,255,255,0.10)' },
} as const;

type Slice = { key: string; label: string; value: number; color: 'green' | 'blue' | 'red'; tone: string };

function Donut({
  size,
  slices,
  hovered,
  onHover,
  centerLabel,
  centerAmount,
  centerPercent,
  centerTone,
  theme,
}: {
  size: number;
  slices: Slice[];
  hovered: string | null;
  onHover: (key: string | null) => void;
  centerLabel: string;
  centerAmount: string;
  centerPercent?: string;
  centerTone?: string | null;
  theme: Theme;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const baseStroke = 7.4;
  const gap = 0.8;
  const segs = slices.map((s) => {
    const frac = s.value / total;
    const len = frac * C;
    const dash = Math.max(0.01, len - gap);
    const offset = C / 4 - acc;
    acc += len;
    return { ...s, dash, gapPart: C - dash, offset };
  });
  const palette = DONUT_COLORS[theme];
  return (
    <div className="donut-wrap" style={{ ['--donut-size' as string]: size + 'px' } as React.CSSProperties}>
      <svg
        className="donut-svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        data-hovered={hovered ? '' : undefined}
        onMouseLeave={() => onHover(null)}
      >
        <circle cx="50" cy="50" r={R} fill="none" stroke={palette.track} strokeWidth={baseStroke} />
        {segs.map((s) => (
          <circle
            key={s.key}
            className="donut-slice"
            data-hot={hovered === s.key ? '' : undefined}
            cx="50"
            cy="50"
            r={R}
            stroke={palette[s.color]}
            strokeWidth={baseStroke}
            strokeDasharray={`${s.dash} ${s.gapPart}`}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
            onMouseEnter={() => onHover(s.key)}
          />
        ))}
      </svg>
      <div className="donut-center">
        <div className="donut-eyebrow">{centerLabel}</div>
        <div
          className="donut-amount num-display"
          style={{ color: centerTone ? `var(--${centerTone})` : 'var(--text-1)' }}
        >
          {centerAmount}
        </div>
        {centerPercent && <div className="donut-percent">{centerPercent}</div>}
      </div>
    </div>
  );
}

// ─── Hero card ────────────────────────────────────────────────────────────
function HeroCard({ stub, theme }: { stub: Stub; theme: Theme }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const slices: Slice[] = [
    { key: 'net',        label: 'Net pay',    value: stub.net,             color: 'green', tone: 'green-text' },
    { key: 'deductions', label: 'Deductions', value: stub.deductionsTotal, color: 'blue',  tone: 'blue-text'  },
    { key: 'taxes',      label: 'Taxes',      value: stub.taxesTotal,      color: 'red',   tone: 'red-text'   },
  ];
  const hot = slices.find((s) => s.key === hovered);
  const centerLabel = hot ? hot.label : 'Gross pay';
  const centerAmount = hot ? fmtMoney(hot.value) : fmtMoney(stub.gross);
  const centerPercent = hot
    ? `${stub.gross > 0 ? ((hot.value / stub.gross) * 100).toFixed(1) : '0.0'}% of gross`
    : stub.rate || stub.period;
  const centerTone = hot ? hot.tone : null;

  return (
    <section className="card hero">
      <Donut
        size={240}
        slices={slices}
        hovered={hovered}
        onHover={setHovered}
        centerLabel={centerLabel}
        centerAmount={centerAmount}
        centerPercent={centerPercent}
        centerTone={centerTone}
        theme={theme}
      />
    </section>
  );
}

// ─── Section cards ────────────────────────────────────────────────────────
function EarningsCard({ stub }: { stub: Stub }) {
  return (
    <section className="card banner-card earnings-card">
      <div className="card-banner green">
        <span className="ttl">Earnings</span>
        <span className="meta">{stub.rate}</span>
      </div>
      <div className="card-body">
        <div className="lines">
          {stub.earnings.length > 0 ? (
            stub.earnings.map((li, i) => (
              <LineRow
                key={`${li.label}-${i}`}
                label={prettyLabel(li.label)}
                meta={i === 0 && stub.hours > 0 ? `${stub.hours.toFixed(2)} hrs` : undefined}
                amount={li.amount}
              />
            ))
          ) : (
            <LineRow label="Gross earnings" meta={stub.hours > 0 ? `${stub.hours.toFixed(2)} hrs` : undefined} amount={stub.gross} />
          )}
          <LineRow label="Gross earnings" amount={stub.gross} subtotal />
          {stub.deposits.length > 0 && (
            <>
              <SectionHd
                title="Net pay deposited"
                meta={`${stub.deposits.length} ${stub.deposits.length === 1 ? 'destination' : 'destinations'}`}
              />
              {stub.deposits.map((d, i) => (
                <LineRow key={i} label={d.bank} meta={`····${d.last4}`} amount={d.amount} />
              ))}
            </>
          )}
          <LineRow label="Net pay" amount={stub.net} subtotal />
        </div>
      </div>
    </section>
  );
}

function DeductionsCard({ stub }: { stub: Stub }) {
  return (
    <section className="card banner-card">
      <div className="card-banner blue">
        <span className="ttl">Deductions</span>
        <span className="meta">Withheld from pay</span>
      </div>
      <div className="card-body">
        <div className="lines">
          {stub.deductions.length > 0 ? (
            <ItemRows items={stub.deductions} />
          ) : (
            <div className="empty-line">No itemized deductions on this stub</div>
          )}
          <LineRow label="Total deductions" amount={stub.deductionsTotal} subtotal />
        </div>
      </div>
    </section>
  );
}

function TaxesCard({ stub }: { stub: Stub }) {
  return (
    <section className="card banner-card taxes-card">
      <div className="card-banner red">
        <span className="ttl">Taxes</span>
        <span className="meta">Withheld at source</span>
      </div>
      <div className="card-body">
        <div className="lines">
          {stub.taxes.length > 0 ? (
            <ItemRows items={stub.taxes} />
          ) : (
            <div className="empty-line">No itemized taxes on this stub</div>
          )}
          <LineRow label="Total taxes" amount={stub.taxesTotal} subtotal />
        </div>
      </div>
    </section>
  );
}

function EmployerCard({ stub }: { stub: Stub }) {
  const items = stub.contributions;
  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  return (
    <section className="card banner-card employer-card">
      <div className="card-banner purple">
        <span className="ttl">Employer contributions</span>
        <span className="meta">On top of your pay</span>
      </div>
      <div className="card-body">
        {items.length > 0 ? (
          <div className="lines" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div className="lines" style={{ gridColumn: '1' }}>
              <ItemRows items={left} />
            </div>
            <div className="lines" style={{ gridColumn: '2' }}>
              <ItemRows items={right} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <LineRow label="Total employer-paid" amount={stub.employerTotal} subtotal />
            </div>
          </div>
        ) : (
          <div className="lines">
            <div className="empty-line">No itemized employer contributions on this stub</div>
            <LineRow label="Total employer-paid" amount={stub.employerTotal} subtotal />
          </div>
        )}
      </div>
    </section>
  );
}

function W4Card({ stub, prev }: { stub: Stub; prev: Stub | null }) {
  const t = stub.taxSettings;
  if (!t) return null;
  const pt = prev?.taxSettings ?? null;
  const fs = (v: string | null) => (v === 'S' ? 'Single' : v === 'M' ? 'Married' : v ?? '—');
  const items: { k: string; v: string; changed: boolean }[] = [];
  if (t.filingStatus) items.push({ k: 'Filing status', v: fs(t.filingStatus), changed: !!pt && pt.filingStatus !== t.filingStatus });
  if (t.claimDependent != null) items.push({ k: 'Dependents claimed', v: fmtMoney(t.claimDependent, { decimals: 0 }), changed: !!pt && (pt.claimDependent ?? 0) !== t.claimDependent });
  if (t.allowances != null) items.push({ k: 'Allowances', v: String(t.allowances), changed: !!pt && (pt.allowances ?? 0) !== t.allowances });
  if (t.additionalAllowances) items.push({ k: "Add'l allowances", v: String(t.additionalAllowances), changed: !!pt && (pt.additionalAllowances ?? 0) !== t.additionalAllowances });
  if (t.otherIncome) items.push({ k: 'Other income', v: fmtMoney(t.otherIncome, { decimals: 0 }), changed: false });
  if (items.length === 0) return null;
  return (
    <section className="card banner-card w4-card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-banner amber">
        <span className="ttl">Tax elections (W-4)</span>
        <span className="meta">As filed this pay period</span>
      </div>
      <div className="card-body">
        <div className="w4-grid">
          {items.map((it, i) => (
            <div className="w4-item" key={i}>
              <span className="w4-k">{it.k}</span>
              <span className="w4-v">
                {it.v}
                {it.changed && <span className="w4-chg">changed</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImputedFootnote({ stub }: { stub: Stub }) {
  if (stub.imputed.length === 0 && stub.nonCashFringe <= 0) return null;
  return (
    <aside className="footnote">
      <span className="ico">i</span>
      <div className="ftn-body">
        <div className="ftn-title">Imputed income — informational only</div>
        <div className="ftn-desc">
          Employer-paid benefits the IRS counts as income — they affect taxable
          wages, not net pay.
        </div>
      </div>
      <div className="ftn-amts">
        {stub.imputed.length > 0 ? (
          stub.imputed.map((li, i) => (
            <div className="ftn-amt" key={i}>
              <span className="k">{prettyLabel(li.label)}</span>
              <span className="v num">{fmtMoney(li.amount)}</span>
            </div>
          ))
        ) : (
          <div className="ftn-amt">
            <span className="k">Non-cash fringe</span>
            <span className="v num">{fmtMoney(stub.nonCashFringe)}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Single stub view ─────────────────────────────────────────────────────
function SingleStubView({
  stub,
  prevStub,
  idx,
  total,
  onPrev,
  onNext,
  theme,
}: {
  stub: Stub;
  prevStub: Stub | null;
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  theme: Theme;
}) {
  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">{fmtDate(stub.date)}</div>
          <div className="stub-meta-inline">
            <span><b>{stub.period}</b></span>
            {stub.bonus > 0 && (
              <>
                <span className="dot">·</span>
                <span style={{ color: 'var(--green-text)', fontWeight: 600 }}>+ Bonus stub</span>
              </>
            )}
          </div>
        </div>
        <div className="stub-nav">
          <button type="button" onClick={onPrev} disabled={idx === 0} aria-label="Previous stub">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11L5 7l4-4" />
            </svg>
          </button>
          <span className="of num">
            Stub <b>{idx + 1}</b> of {total}
          </span>
          <button type="button" onClick={onNext} disabled={idx === total - 1} aria-label="Next stub">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="single-stub">
        <HeroCard stub={stub} theme={theme} />
        <EarningsCard stub={stub} />
        <DeductionsCard stub={stub} />
        <TaxesCard stub={stub} />
        <EmployerCard stub={stub} />
        <W4Card stub={stub} prev={prevStub} />
        <ImputedFootnote stub={stub} />
      </div>
    </>
  );
}

// ─── All stubs view ───────────────────────────────────────────────────────
function AllStubsView({
  stubs,
  events,
  onJumpToStub,
}: {
  stubs: Stub[];
  events: PayrollEvent[];
  onJumpToStub: (id: string) => void;
}) {
  const years = useMemo(() => stubYears(stubs), [stubs]);
  type YearFilter = 'all' | number;
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const eventsByDate = useMemo<Map<string, PayrollEvent[]>>(() => {
    const m = new Map<string, PayrollEvent[]>();
    for (const e of events) m.set(e.stubDate, [...(m.get(e.stubDate) ?? []), e]);
    return m;
  }, [events]);
  const rows = useMemo(
    () => stubs.filter((s) => (yearFilter === 'all' ? true : s.date.startsWith(String(yearFilter)))),
    [stubs, yearFilter],
  );

  const filters: YearFilter[] = ['all', ...years];

  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">All pay stubs</div>
          <div className="stub-meta">
            <b>{rows.length}</b> stubs · click any row to drill in
          </div>
        </div>
        {years.length > 1 && (
          <div className="ytd-year-tabs">
            {filters.map((y) => (
              <button
                type="button"
                key={String(y)}
                className={'ytd-year-tab' + (yearFilter === y ? ' active' : '')}
                onClick={() => setYearFilter(y)}
              >
                {y === 'all' ? 'All' : y}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="card stubs-list">
        <div className="stubs-list-hd">
          <div>Date</div>
          <div>Period</div>
          <div>Events</div>
          <div className="r">Gross</div>
          <div className="r">Change</div>
          <div className="r">Deductions</div>
          <div className="r">Taxes</div>
          <div className="r">Net</div>
        </div>
        <div className="stubs-list-body">
          {rows.map((s, i) => {
            const rowEvents = eventsByDate.get(s.date) ?? [];
            const prevGross = i > 0 ? rows[i - 1]!.gross : null;
            const delta = prevGross != null ? +(s.gross - prevGross).toFixed(2) : 0;
            const effTax = s.gross > 0 ? (s.taxesTotal / s.gross) * 100 : 0;
            const takeHome = s.gross > 0 ? (s.net / s.gross) * 100 : 0;
            return (
              <div key={s.id} className="stub-list-row" onClick={() => onJumpToStub(s.id)}>
                <div className="col-date">
                  <span className="d">{fmtDate(s.date)}</span>
                  <span className="v">{s.voucher}</span>
                </div>
                <div className="col-period">
                  <span className="p">{s.period}</span>
                </div>
                <div className="col-events">
                  {rowEvents.map((e, j) => (
                    <span key={j} className={'evt-chip ' + e.tone} title={e.desc}>
                      {e.label}
                    </span>
                  ))}
                </div>
                <div className="amt muted">{fmtMoney(s.gross)}</div>
                <div className="amt col-change">
                  {delta !== 0 ? (
                    <span className={'mom-chip ' + (delta > 0 ? 'up' : 'down')}>
                      {delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta), { decimals: 0 })}
                    </span>
                  ) : (
                    <span className="amt-sub">—</span>
                  )}
                </div>
                <div className="amt blue">{fmtMoney(s.deductionsTotal)}</div>
                <div className="amt red">
                  {fmtMoney(s.taxesTotal)}
                  <span className="amt-sub">{effTax.toFixed(1)}% eff.</span>
                </div>
                <div className="amt green">
                  {fmtMoney(s.net)}
                  <span className="amt-sub">{takeHome.toFixed(0)}% take-home</span>
                </div>
              </div>
            );
          })}
        </div>
        {rows.length > 0 && (
          <div className="stub-list-row foot">
            <div className="col-date">
              <span className="d">Totals</span>
              <span className="v">{rows.length} stubs</span>
            </div>
            <div className="col-period" />
            <div className="col-events" />
            <div className="amt muted">{fmtMoney(rows.reduce((a, s) => a + s.gross, 0))}</div>
            <div className="amt col-change" />
            <div className="amt blue">{fmtMoney(rows.reduce((a, s) => a + s.deductionsTotal, 0))}</div>
            <div className="amt red">{fmtMoney(rows.reduce((a, s) => a + s.taxesTotal, 0))}</div>
            <div className="amt green">{fmtMoney(rows.reduce((a, s) => a + s.net, 0))}</div>
          </div>
        )}
      </section>
    </>
  );
}

// ─── YTD view ─────────────────────────────────────────────────────────────
function YTDView({
  stubs,
  events,
  onJumpToStub,
}: {
  stubs: Stub[];
  events: PayrollEvent[];
  onJumpToStub: (id: string) => void;
}) {
  const years = useMemo(() => stubYears(stubs), [stubs]);
  const [year, setYear] = useState<number>(years[years.length - 1] ?? new Date().getFullYear());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const ytd = useMemo(() => computeYTD(stubs, year), [stubs, year]);
  const isPartial = ytd.stubCount < 12;
  const eventsForYear = events.filter((e) => e.stubDate.startsWith(String(year)));
  const eventByDate = Object.fromEntries(eventsForYear.map((e) => [e.stubDate, e]));
  const maxStubGross = Math.max(1, ...ytd.stubs.map((s) => s.gross));
  const avgNet = ytd.stubCount > 0 ? ytd.net / ytd.stubCount : 0;
  const p = fmtMoneyParts(ytd.net);

  // Derived insights
  const totalComp = +(ytd.gross + ytd.employerTotal).toFixed(2);
  const savings = +(ytd.k401Contrib + ytd.k401Match + ytd.espp + ytd.fsa).toFixed(2);
  const savingsRate = ytd.gross > 0 ? (savings / ytd.gross) * 100 : 0;
  const netPct = ytd.gross > 0 ? (ytd.net / ytd.gross) * 100 : 0;
  const taxPct = ytd.gross > 0 ? (ytd.taxesYours / ytd.gross) * 100 : 0;
  const dedPct = ytd.gross > 0 ? (ytd.deductionsTotal / ytd.gross) * 100 : 0;
  const annualFactor = ytd.stubCount > 0 ? 12 / ytd.stubCount : 1;
  const dests = depositsByBankYTD(stubs, year);
  const yoy = years.slice(-2).map((y) => {
    const d = computeYTD(stubs, y);
    return {
      year: y,
      gross: d.gross,
      net: d.net,
      effRate: d.gross > 0 ? (d.taxesYours / d.gross) * 100 : 0,
      takeHome: d.gross > 0 ? (d.net / d.gross) * 100 : 0,
      partial: d.stubCount < 12,
    };
  });

  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">{year} Year-to-date</div>
          <div className="stub-meta">
            <b>
              {ytd.stubCount} {ytd.stubCount === 1 ? 'stub' : 'stubs'}
            </b>
            {isPartial && (
              <>
                {' '}
                · <span style={{ color: 'var(--amber-text)' }}>Partial year</span>
              </>
            )}
          </div>
        </div>
        {years.length > 1 && (
          <div className="ytd-year-tabs">
            {years.map((y) => {
              const partial = stubs.filter((s) => s.date.startsWith(String(y))).length < 12;
              return (
                <button
                  type="button"
                  key={y}
                  className={'ytd-year-tab' + (year === y ? ' active' : '')}
                  onClick={() => setYear(y)}
                >
                  {y}
                  {partial && <span className="partial">Partial</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="stack">
        <section className="card ytd-hero">
          <div className="ytd-hero-l">
            <span className="eyebrow">Net pay deposited · YTD {year}</span>
            <div className="ytd-hero-display num-display">
              ${p.whole}<span className="cents">.{p.cents}</span>
            </div>
            <div className="ytd-hero-sub">
              <span>
                Gross <b>{fmtMoney(ytd.gross)}</b>
              </span>
              <span>
                · Taxes (yours) <b>{fmtMoney(ytd.taxesYours)}</b>
              </span>
              <span>
                · Deductions <b>{fmtMoney(ytd.deductionsTotal)}</b>
              </span>
            </div>
            {/* Where your gross went — 100% split */}
            <div className="ytd-split">
              <div className="ytd-split-bar">
                <span className="seg net" style={{ width: `${netPct}%` }} title={`Net ${netPct.toFixed(0)}%`} />
                <span className="seg tax" style={{ width: `${taxPct}%` }} title={`Taxes ${taxPct.toFixed(0)}%`} />
                <span className="seg ded" style={{ width: `${dedPct}%` }} title={`Deductions ${dedPct.toFixed(0)}%`} />
              </div>
              <div className="ytd-split-legend">
                <span><i className="net" /> Net {netPct.toFixed(0)}%</span>
                <span><i className="tax" /> Taxes {taxPct.toFixed(0)}%</span>
                <span><i className="ded" /> Deductions {dedPct.toFixed(0)}%</span>
              </div>
            </div>
            {isPartial && (
              <div className="ytd-projection">
                On pace for ~<b>{fmtMoney(ytd.net * annualFactor, { decimals: 0 })}</b> net
                {' '}(<b>{fmtMoney(ytd.gross * annualFactor, { decimals: 0 })}</b> gross) this year
              </div>
            )}
          </div>
          <div className="ytd-hero-r">
            <div className="ytd-hero-stat">
              <span className="avg-lbl">Total comp</span>
              <span className="avg num">{fmtMoney(totalComp, { decimals: 0 })}</span>
              <span className="ytd-hero-stat-sub">incl. {fmtMoney(ytd.employerTotal, { decimals: 0 })} employer</span>
            </div>
            <div className="ytd-hero-stat">
              <span className="avg-lbl">Avg / stub</span>
              <span className="avg num">{fmtMoney(avgNet)}</span>
            </div>
          </div>
        </section>

        <div className="ytd-grid">
          <section className="card ytd-metric">
            <span className="lbl">Gross earnings</span>
            <span className="val num">{fmtMoney(ytd.gross)}</span>
            <span className="pct">
              {ytd.bonus > 0 ? `incl. ${fmtMoney(ytd.bonus)} bonus` : 'Salary only'}
            </span>
          </section>
          <section className="card ytd-metric red">
            <span className="lbl">Taxes withheld</span>
            <span className="val num">{fmtMoney(ytd.taxesYours)}</span>
            <span className="pct">
              {ytd.gross > 0 ? ((ytd.taxesYours / ytd.gross) * 100).toFixed(1) : '0.0'}% effective
            </span>
          </section>
          <section className="card ytd-metric blue">
            <span className="lbl">Deductions</span>
            <span className="val num">{fmtMoney(ytd.deductionsTotal)}</span>
            <span className="pct">
              {fmtMoney(ytd.deductionsPreTax)} pre · {fmtMoney(ytd.deductionsPostTax)} post
            </span>
          </section>
          <section className="card ytd-metric purple">
            <span className="lbl">Employer-paid</span>
            <span className="val num">{fmtMoney(ytd.employerTotal)}</span>
            <span className="pct">{fmtMoney(ytd.employerBenefits)} benefits + taxes</span>
          </section>
        </div>

        <section className="card ytd-chart">
          <div className="ytd-chart-hd">
            <span className="ttl">Monthly breakdown</span>
            <span className="lgnd">
              <span className="sw">
                <span className="dot" style={{ background: 'var(--green)' }} /> Net
              </span>
              <span className="sw">
                <span className="dot" style={{ background: 'var(--blue)' }} /> Deductions
              </span>
              <span className="sw">
                <span className="dot" style={{ background: 'var(--red)' }} /> Taxes
              </span>
            </span>
          </div>
          <div className="ytd-chart-body" onMouseLeave={() => setHoverIdx(null)}>
            {ytd.stubs.map((s, i) => {
              const evt = eventByDate[s.date];
              const nPct = (s.net / maxStubGross) * 100;
              const dPct = (s.deductionsTotal / maxStubGross) * 100;
              const tPct = (s.taxesTotal / maxStubGross) * 100;
              const dimmed = hoverIdx != null && hoverIdx !== i;
              return (
                <div
                  key={s.id}
                  className={'ytd-bar-col' + (dimmed ? ' dimmed' : '')}
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => onJumpToStub(s.id)}
                  title={`${fmtDate(s.date)} · Gross ${fmtMoney(s.gross)} · Net ${fmtMoney(s.net)}`}
                >
                  <div
                    className={'ytd-bar-evt ' + (evt ? evt.tone : '')}
                    style={evt ? undefined : { visibility: 'hidden' }}
                  />
                  <div className="ytd-bar-stack" style={{ height: 150 }}>
                    <div className="ytd-bar-seg net" style={{ height: `${nPct}%` }} />
                    <div className="ytd-bar-seg deduct" style={{ height: `${dPct}%` }} />
                    <div className="ytd-bar-seg tax" style={{ height: `${tPct}%` }} />
                  </div>
                  <div className="ytd-bar-lbl">{fmtMonth(s.date)}</div>
                </div>
              );
            })}
          </div>
          {hoverIdx != null && ytd.stubs[hoverIdx] && (
            <div
              style={{
                padding: '10px 18px 16px',
                borderTop: '1px solid var(--line)',
                display: 'grid',
                gridTemplateColumns: '1fr repeat(4, auto)',
                gap: 16,
                fontSize: 13,
                alignItems: 'baseline',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                  {fmtDate(ytd.stubs[hoverIdx]!.date)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ytd.stubs[hoverIdx]!.period}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Gross</div>
                <div className="num" style={{ fontWeight: 600 }}>{fmtMoney(ytd.stubs[hoverIdx]!.gross)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--green-text)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Net</div>
                <div className="num" style={{ fontWeight: 600, color: 'var(--green-text)' }}>{fmtMoney(ytd.stubs[hoverIdx]!.net)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--blue-text)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Deductions</div>
                <div className="num" style={{ fontWeight: 600, color: 'var(--blue-text)' }}>{fmtMoney(ytd.stubs[hoverIdx]!.deductionsTotal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--red-text)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Taxes</div>
                <div className="num" style={{ fontWeight: 600, color: 'var(--red-text)' }}>{fmtMoney(ytd.stubs[hoverIdx]!.taxesTotal)}</div>
              </div>
            </div>
          )}
        </section>

        <div className="row-pair">
          <section className="card banner-card">
            <div className="card-banner green">
              <span className="ttl">Saved + invested</span>
              <span className="meta">{savingsRate.toFixed(0)}% savings rate</span>
            </div>
            <div className="card-body">
              <div className="lines">
                <LineRow label="401(k) contribution" meta="Pre-tax" amount={ytd.k401Contrib} />
                <LineRow label="Employer 401(k) match" meta="Free money" amount={ytd.k401Match} />
                {ytd.espp > 0 && <LineRow label="ESPP" meta="Post-tax stock" amount={ytd.espp} />}
                {ytd.fsa > 0 && <LineRow label="FSA / HSA" meta="Pre-tax health" amount={ytd.fsa} />}
                <LineRow
                  label="Total retirement + stock"
                  amount={+(ytd.k401Contrib + ytd.k401Match + ytd.espp).toFixed(2)}
                  subtotal
                />
              </div>
            </div>
          </section>

          <section className="card banner-card">
            <div className="card-banner amber">
              <span className="ttl">Year events</span>
              <span className="meta">
                {eventsForYear.length} {eventsForYear.length === 1 ? 'change' : 'changes'}
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="ytd-events">
                {eventsForYear.length === 0 && (
                  <div style={{ padding: '18px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                    No notable changes this year
                  </div>
                )}
                {eventsForYear.map((e, i) => (
                  <div key={i} className="ytd-event">
                    <div className={'swatch ' + e.tone} />
                    <div className="info">
                      <div className="lbl">{e.label}</div>
                      <div className="desc">{e.desc}</div>
                    </div>
                    <div className="dt">{fmtDateShort(e.stubDate)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="row-pair">
          <section className="card banner-card">
            <div className="card-banner green">
              <span className="ttl">Net pay by destination</span>
              <span className="meta">{dests.length} {dests.length === 1 ? 'account' : 'accounts'}</span>
            </div>
            <div className="card-body">
              <div className="ytd-dests">
                {dests.length === 0 && <div className="empty-line">No deposit splits recorded</div>}
                {dests.map((d, i) => (
                  <div key={i} className="ytd-dest">
                    <span className="bank">{d.bank} <span className="last4">····{d.last4}</span></span>
                    <span className="bar"><span style={{ width: `${d.pct}%` }} /></span>
                    <span className="amt num">{fmtMoney(d.total)}</span>
                    <span className="pct num">{d.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card banner-card">
            <div className="card-banner blue">
              <span className="ttl">Year over year</span>
              <span className="meta">{yoy.map((y) => y.year).join(' vs ')}</span>
            </div>
            <div className="card-body">
              <div className="ytd-yoy">
                <div className="ytd-yoy-row head">
                  <span />
                  {yoy.map((y) => (
                    <span key={y.year} className="yr">
                      {y.year}{y.partial && <i className="partial-dot" title="Partial year" />}
                    </span>
                  ))}
                </div>
                {([
                  ['Gross', (y: (typeof yoy)[number]) => fmtMoney(y.gross, { decimals: 0 })],
                  ['Net', (y: (typeof yoy)[number]) => fmtMoney(y.net, { decimals: 0 })],
                  ['Effective tax', (y: (typeof yoy)[number]) => `${y.effRate.toFixed(1)}%`],
                  ['Take-home', (y: (typeof yoy)[number]) => `${y.takeHome.toFixed(0)}%`],
                ] as const).map(([label, fn]) => (
                  <div key={label} className="ytd-yoy-row">
                    <span className="k">{label}</span>
                    {yoy.map((y) => <span key={y.year} className="num">{fn(y)}</span>)}
                  </div>
                ))}
              </div>
              <div className="ytd-yoy-note">Raw YTD totals — partial years aren’t annualized.</div>
            </div>
          </section>
        </div>

        <section className="card banner-card">
          <div className="card-banner red">
            <span className="ttl">Tax breakdown · YTD {year}</span>
            <span className="meta">Yours · {fmtMoney(ytd.taxesYours)}</span>
          </div>
          <div className="card-body">
            <div className="lines" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <div className="lines">
                <LineRow label="Federal income tax" meta="FIT" amount={ytd.fit} />
                <LineRow label="State / local" meta="SIT, SDI" amount={ytd.state} />
              </div>
              <div className="lines">
                <LineRow label="Social Security" meta="FICA" amount={ytd.fica} />
                <LineRow label="Medicare" meta="1.45%" amount={ytd.medicare} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <LineRow label="Total · withheld from your pay" amount={ytd.taxesYours} subtotal />
                <div
                  style={{
                    padding: '10px 0 0',
                    fontSize: 12,
                    color: 'var(--text-3)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--line)',
                    marginTop: 8,
                  }}
                >
                  <span>+ Employer-paid payroll taxes (FICA match, Medicare match, FUTA, SUTA)</span>
                  <span className="num" style={{ color: 'var(--text-2)', fontWeight: 500 }}>
                    {fmtMoney(ytd.taxesEmployer)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <section className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
        No paystubs yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 420, margin: '0 auto' }}>
        Upload a paystub PDF on the Upload page and it’ll appear here — with the
        full earnings, deductions, taxes, and employer-contribution breakdown.
      </div>
      <a
        href="/upload"
        style={{
          display: 'inline-block',
          marginTop: 18,
          padding: '8px 16px',
          borderRadius: 10,
          background: 'var(--blue)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Go to Upload
      </a>
    </section>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────
export function PayrollClient({ stubs }: { stubs: Stub[] }) {
  const theme = useTheme();
  const events = useMemo(() => deriveEvents(stubs), [stubs]);
  const [activeTab, setActiveTab] = useState<'single' | 'all' | 'ytd'>('single');
  const [stubIdx, setStubIdx] = useState(() => Math.max(0, stubs.length - 1));

  if (stubs.length === 0) return <EmptyState />;

  const idx = Math.min(stubIdx, stubs.length - 1);
  const stub = stubs[idx]!;
  const jumpTo = (id: string) => {
    const i = stubs.findIndex((s) => s.id === id);
    if (i >= 0) {
      setStubIdx(i);
      setActiveTab('single');
    }
  };

  return (
    <>
      <nav className="tabs" role="tablist">
        {[
          { id: 'single' as const, label: 'Single stub', count: stubs.length },
          { id: 'all' as const,    label: 'All stubs',   count: stubs.length },
          { id: 'ytd' as const,    label: 'YTD summary', count: null },
        ].map((tab) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={'tab' + (activeTab === tab.id ? ' active' : '')}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count != null && <span className="count num">{tab.count}</span>}
          </button>
        ))}
      </nav>

      {activeTab === 'single' && (
        <SingleStubView
          stub={stub}
          prevStub={idx > 0 ? stubs[idx - 1]! : null}
          idx={idx}
          total={stubs.length}
          onPrev={() => setStubIdx((i) => Math.max(0, Math.min(i, stubs.length - 1) - 1))}
          onNext={() => setStubIdx((i) => Math.min(stubs.length - 1, i + 1))}
          theme={theme}
        />
      )}
      {activeTab === 'all' && <AllStubsView stubs={stubs} events={events} onJumpToStub={jumpTo} />}
      {activeTab === 'ytd' && <YTDView stubs={stubs} events={events} onJumpToStub={jumpTo} />}
    </>
  );
}
