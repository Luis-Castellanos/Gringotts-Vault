'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  STUBS,
  EVENTS,
  computeStub,
  computeYTD,
  fmtMoney,
  fmtMoneyParts,
  fmtDate,
  fmtDateShort,
  fmtMonth,
  type ComputedStub,
  type EventTone,
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
  const total = slices.reduce((s, x) => s + x.value, 0);
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
function HeroCard({ stub, theme }: { stub: ComputedStub; theme: Theme }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const slices: Slice[] = [
    { key: 'net',        label: 'Net pay',    value: stub.net,                color: 'green', tone: 'green-text' },
    { key: 'deductions', label: 'Deductions', value: stub.deductions.total,   color: 'blue',  tone: 'blue-text'  },
    { key: 'taxes',      label: 'Taxes',      value: stub.taxes.total,        color: 'red',   tone: 'red-text'   },
  ];
  const hot = slices.find((s) => s.key === hovered);
  const centerLabel = hot ? hot.label : 'Gross pay';
  const centerAmount = hot ? fmtMoney(hot.value) : fmtMoney(stub.gross);
  const centerPercent = hot
    ? `${((hot.value / stub.gross) * 100).toFixed(1)}% of gross`
    : stub.rate;
  const centerTone = hot ? hot.tone : null;
  const p = fmtMoneyParts(stub.net);

  return (
    <section className="card hero">
      <div className="hero-l">
        <div className="hero-top">
          <span className="eyebrow">Net pay deposited</span>
          <span className="hero-sub">
            Settled <b>{fmtDate(stub.date)}</b> · {stub.deposits.length}{' '}
            {stub.deposits.length === 1 ? 'destination' : 'destinations'}
          </span>
        </div>
        <div className="hero-display num-display">
          ${p.whole}<span className="cents">.{p.cents}</span>
        </div>
        <div className="deposit-list">
          {stub.deposits.map((d, i) => (
            <div className="deposit-row" key={i}>
              <div className="bank">
                <span className="bank-dot" />
                {d.bank} <span className="last4">····{d.last4}</span>
              </div>
              <div className="amt num">{fmtMoney(d.amount)}</div>
            </div>
          ))}
        </div>
      </div>
      <Donut
        size={280}
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
function EarningsCard({ stub }: { stub: ComputedStub }) {
  return (
    <section className="card banner-card">
      <div className="card-banner green">
        <span className="ttl">Earnings</span>
        <span className="meta">{stub.rate}</span>
      </div>
      <div className="card-body">
        <div className="lines">
          <LineRow label="Salary" meta={`${stub.earnings.hours.toFixed(2)} hrs`} amount={stub.earnings.salary} />
          {stub.earnings.bonus > 0 && (
            <LineRow label="Annual bonus" meta="Supplemental" amount={stub.earnings.bonus} />
          )}
          <LineRow label="Gross earnings" amount={stub.gross} subtotal />
        </div>
      </div>
    </section>
  );
}

function DeductionsCard({ stub }: { stub: ComputedStub }) {
  const d = stub.deductions;
  return (
    <section className="card banner-card">
      <div className="card-banner blue">
        <span className="ttl">Deductions</span>
        <span className="meta">Pre + post-tax</span>
      </div>
      <div className="card-body">
        <div className="lines">
          <SectionHd title="Pre-tax" meta="Reduces taxable wages" />
          <LineRow label="401(k) contribution" meta="6%" amount={d.preTax.k401} />
          <LineRow label="FSA — Healthcare" meta="$3,300/yr" amount={d.preTax.fsa} />
          <LineRow label="Medical premium" amount={d.preTax.medical} />
          <LineRow label="Dental premium" amount={d.preTax.dental} />
          <LineRow label="Vision premium" amount={d.preTax.vision} />
          {d.postTax.espp > 0 && (
            <>
              <SectionHd title="Post-tax" meta="After-tax buys" />
              <LineRow label="ESPP" meta="10% · STOCK" amount={d.postTax.espp} />
            </>
          )}
          <LineRow label="Total deductions" amount={d.total} subtotal />
        </div>
      </div>
    </section>
  );
}

function TaxesCard({ stub }: { stub: ComputedStub }) {
  const t = stub.taxes;
  return (
    <section className="card banner-card">
      <div className="card-banner red">
        <span className="ttl">Taxes</span>
        <span className="meta">Withheld at source</span>
      </div>
      <div className="card-body">
        <div className="lines">
          <LineRow
            label="Federal income tax"
            meta={stub.w4 === 'new' ? 'W4: $7,097 claim' : 'W4: $0 claim'}
            amount={t.fit}
          />
          <LineRow label="Social Security" meta="6.2%" amount={t.fica} />
          <LineRow label="Medicare" meta="1.45%" amount={t.med} />
          <LineRow label="Ohio state tax" meta="~3.2%" amount={t.state} />
          <LineRow label="Total taxes" amount={t.total} subtotal />
        </div>
      </div>
    </section>
  );
}

function EmployerCard({ stub }: { stub: ComputedStub }) {
  const e = stub.employer;
  return (
    <section className="card banner-card employer-card">
      <div className="card-banner purple">
        <span className="ttl">Employer contributions</span>
        <span className="meta">On top of your pay</span>
      </div>
      <div className="card-body">
        <div className="lines" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <div className="lines" style={{ gridColumn: '1' }}>
            <SectionHd title="Benefits" />
            <LineRow label="401(k) match" meta="3% safe harbor" amount={e.k401Match} />
            <LineRow label="Health premium" meta="Employer share" amount={e.health} />
            <LineRow label="Dental premium" meta="Employer share" amount={e.dental} />
            <LineRow label="LTD insurance" meta="Long-term disab." amount={e.ltd} />
            <LineRow label="GTLI" meta="Group term life" amount={e.gtli} />
          </div>
          <div className="lines" style={{ gridColumn: '2' }}>
            <SectionHd title="Payroll taxes" meta="Employer-side" />
            <LineRow label="Social Security match" meta="6.2%" amount={e.fica} />
            <LineRow label="Medicare match" meta="1.45%" amount={e.medicare} />
            <LineRow label="FUTA" meta="Federal unemp." amount={e.futa} />
            <LineRow label="SUTA" meta="State unemp." amount={e.suta} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <LineRow label="Total employer-paid" amount={e.total} subtotal />
          </div>
        </div>
      </div>
    </section>
  );
}

function ImputedFootnote({ stub }: { stub: ComputedStub }) {
  const i = stub.imputed;
  return (
    <aside className="footnote">
      <span className="ico">i</span>
      <div className="ftn-body">
        <div className="ftn-title">Imputed income — informational only</div>
        <div className="ftn-desc">
          LTD and GTLI are employer-paid benefits the IRS counts as income —
          they affect taxable wages, not net pay.
        </div>
      </div>
      <div className="ftn-amts">
        <div className="ftn-amt">
          <span className="k">LTD</span>
          <span className="v num">{fmtMoney(i.ltd)}</span>
        </div>
        <div className="ftn-amt">
          <span className="k">GTLI</span>
          <span className="v num">{fmtMoney(i.gtli)}</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Single stub view ─────────────────────────────────────────────────────
function SingleStubView({
  stub,
  idx,
  total,
  onPrev,
  onNext,
  theme,
}: {
  stub: ComputedStub;
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
            <span className="dot">·</span>
            <span>Voucher {stub.voucher}</span>
            <span className="dot">·</span>
            <span>{stub.rate}</span>
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
        <ImputedFootnote stub={stub} />
      </div>
    </>
  );
}

// ─── All stubs view ───────────────────────────────────────────────────────
type YearFilter = 'all' | 2025 | 2026;

function AllStubsView({ onJumpToStub }: { onJumpToStub: (id: number) => void }) {
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const eventByDate = useMemo<Record<string, (typeof EVENTS)[number]>>(
    () => Object.fromEntries(EVENTS.map((e) => [e.stubDate, e])),
    [],
  );
  const rows = useMemo(() => {
    return STUBS.map(computeStub).filter((s) => {
      if (yearFilter === 'all') return true;
      return s.date.startsWith(String(yearFilter));
    });
  }, [yearFilter]);

  const years: YearFilter[] = ['all', 2025, 2026];

  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">All pay stubs</div>
          <div className="stub-meta">
            <b>{rows.length}</b> stubs · click any row to drill in
          </div>
        </div>
        <div className="ytd-year-tabs">
          {years.map((y) => (
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
      </div>

      <section className="card stubs-list">
        <div className="stubs-list-hd">
          <div>Date</div>
          <div>Period</div>
          <div className="r">Gross</div>
          <div className="r">Deductions</div>
          <div className="r">Taxes</div>
          <div className="r">Net</div>
        </div>
        <div className="stubs-list-body">
          {rows.map((s) => {
            const evt = eventByDate[s.date];
            const chips: { tone: EventTone; label: string }[] = [];
            if (s.bonus > 0) chips.push({ tone: 'purple', label: 'Bonus' });
            if (evt) chips.push({ tone: evt.tone, label: evt.label });
            return (
              <div key={s.id} className="stub-list-row" onClick={() => onJumpToStub(s.id)}>
                <div className="col-date">
                  <span className="d">{fmtDate(s.date)}</span>
                  <span className="v">{s.voucher}</span>
                </div>
                <div className="col-period">
                  <span className="p">{s.period}</span>
                  {chips.length > 0 && (
                    <span className="evts">
                      {chips.map((c, i) => (
                        <span key={i} className={'evt-chip ' + c.tone}>
                          {c.label}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="amt muted">{fmtMoney(s.gross)}</div>
                <div className="amt blue">{fmtMoney(s.deductions.total)}</div>
                <div className="amt red">{fmtMoney(s.taxes.total)}</div>
                <div className="amt green">{fmtMoney(s.net)}</div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ─── YTD view ─────────────────────────────────────────────────────────────
function YTDView({ onJumpToStub }: { onJumpToStub: (id: number) => void }) {
  const [year, setYear] = useState<number>(2025);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const ytd = useMemo(() => computeYTD(year), [year]);
  const isPartial = ytd.stubCount < 12;
  const eventsForYear = EVENTS.filter((e) => e.stubDate.startsWith(String(year)));
  const eventByDate = Object.fromEntries(eventsForYear.map((e) => [e.stubDate, e]));
  const maxStubGross = Math.max(...ytd.stubs.map((s) => s.gross));
  const avgNet = ytd.stubCount > 0 ? ytd.net / ytd.stubCount : 0;
  const p = fmtMoneyParts(ytd.net);

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
            {' · '}aggregated from CBIZ payroll
          </div>
        </div>
        <div className="ytd-year-tabs">
          {[2025, 2026].map((y) => {
            const stubs = STUBS.filter((s) => s.date.startsWith(String(y)));
            const partial = stubs.length < 12;
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
          </div>
          <div className="ytd-hero-r">
            <span className="avg-lbl">Avg / stub</span>
            <span className="avg num">{fmtMoney(avgNet)}</span>
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
              const netPct = (s.net / maxStubGross) * 100;
              const dedPct = (s.deductions.total / maxStubGross) * 100;
              const taxPct = (s.taxes.total / maxStubGross) * 100;
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
                    <div className="ytd-bar-seg net" style={{ height: `${netPct}%` }} />
                    <div className="ytd-bar-seg deduct" style={{ height: `${dedPct}%` }} />
                    <div className="ytd-bar-seg tax" style={{ height: `${taxPct}%` }} />
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
                <div className="num" style={{ fontWeight: 600, color: 'var(--blue-text)' }}>{fmtMoney(ytd.stubs[hoverIdx]!.deductions.total)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--red-text)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Taxes</div>
                <div className="num" style={{ fontWeight: 600, color: 'var(--red-text)' }}>{fmtMoney(ytd.stubs[hoverIdx]!.taxes.total)}</div>
              </div>
            </div>
          )}
        </section>

        <div className="row-pair">
          <section className="card banner-card">
            <div className="card-banner green">
              <span className="ttl">Saved + invested</span>
              <span className="meta">YTD</span>
            </div>
            <div className="card-body">
              <div className="lines">
                <LineRow label="401(k) contribution" meta="Pre-tax" amount={ytd.k401Contrib} />
                <LineRow label="Employer 401(k) match" meta="Free money" amount={ytd.k401Match} />
                {ytd.espp > 0 && <LineRow label="ESPP" meta="Post-tax stock" amount={ytd.espp} />}
                <LineRow label="FSA — Healthcare" meta="Use it or lose it" amount={ytd.fsa} />
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

        <section className="card banner-card">
          <div className="card-banner red">
            <span className="ttl">Tax breakdown · YTD {year}</span>
            <span className="meta">Yours · {fmtMoney(ytd.taxesYours)}</span>
          </div>
          <div className="card-body">
            <div className="lines" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <div className="lines">
                <LineRow label="Federal income tax" meta="FIT" amount={ytd.fit} />
                <LineRow label="Ohio state tax" meta="~3.2%" amount={ytd.state} />
              </div>
              <div className="lines">
                <LineRow label="Social Security" meta="6.2%" amount={ytd.fica} />
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

// ─── Main client ──────────────────────────────────────────────────────────
export function PayrollClient() {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'single' | 'all' | 'ytd'>('single');
  const [stubIdx, setStubIdx] = useState(STUBS.length - 1);
  const stub = useMemo(() => computeStub(STUBS[stubIdx]!), [stubIdx]);

  return (
    <>
      <header className="page-hd">
        <div>
          <h1 className="page-title">Income · Payroll</h1>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {[
          { id: 'single' as const, label: 'Single stub', count: STUBS.length },
          { id: 'all' as const,    label: 'All stubs',   count: STUBS.length },
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
          idx={stubIdx}
          total={STUBS.length}
          onPrev={() => setStubIdx((i) => Math.max(0, i - 1))}
          onNext={() => setStubIdx((i) => Math.min(STUBS.length - 1, i + 1))}
          theme={theme}
        />
      )}
      {activeTab === 'all' && (
        <AllStubsView
          onJumpToStub={(id) => {
            const idx = STUBS.findIndex((s) => s.id === id);
            if (idx >= 0) {
              setStubIdx(idx);
              setActiveTab('single');
            }
          }}
        />
      )}
      {activeTab === 'ytd' && (
        <YTDView
          onJumpToStub={(id) => {
            const idx = STUBS.findIndex((s) => s.id === id);
            if (idx >= 0) {
              setStubIdx(idx);
              setActiveTab('single');
            }
          }}
        />
      )}
    </>
  );
}
