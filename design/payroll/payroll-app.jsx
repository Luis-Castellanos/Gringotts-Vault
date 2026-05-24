// payroll-app.jsx — main Income & Payroll view.

const { useState, useMemo, useEffect, useRef } = React;

// Babel scripts don't share scope; explicitly pull shared deps from window.
const { STUBS, computeStub, fmtMoney, fmtMoneyParts, fmtDate,
        LineRow, SectionHd, YTDView, AllStubsView,
        TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSlider, TweakSelect,
        useTweaks } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "regular",
  "wireframe": false,
  "donutSize": 250,
  "activeTab": "single"
}/*EDITMODE-END*/;

// ─── Donut ────────────────────────────────────────────────────────────────
// Fixed-size SVG donut. Container is explicit width/height; SVG fills 100%
// with viewBox 100x100. Stroke is in viewBox units, scaled by container.
// Hover: hot slice grows stroke 7.4 → 10 via CSS transition with ease-back.

// Direct hex colors per theme — bypasses CSS-variable hijacking by
// browser extensions (Dark Reader rewrites stroke="var(--green)").
const DONUT_COLORS = {
  light: { green: "#16a34a", blue: "#2563eb", red: "#dc2626", track: "rgba(0,0,0,0.06)" },
  dark:  { green: "#4ade80", blue: "#60a5fa", red: "#f87171", track: "rgba(255,255,255,0.10)" },
};

function Donut({ size, slices, hovered, onHover, centerLabel, centerAmount, centerPercent, centerTone, theme }) {
  // slices: [{ key, value, color }]
  const total = slices.reduce((s, x) => s + x.value, 0);
  // viewBox 100x100; donut radius 40; circumference 2π·40 ≈ 251.33
  const R = 40;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const baseStroke = 7.4;
  // Small visual gap between slices (in stroke-dasharray gap)
  const gap = 0.8;

  const segs = slices.map((s) => {
    const frac = s.value / total;
    const len = frac * C;
    const dash = Math.max(0.01, len - gap);
    // Positive offset shifts the dash pattern backward along the path,
    // i.e. starts the slice later. SVG circles begin at 3 o'clock and go
    // clockwise; +C/4 - acc puts slice 1 at 12 o'clock and chains the rest.
    const offset = C / 4 - acc;
    acc += len;
    return { ...s, dash, gap: C - dash, offset };
  });

  const palette = DONUT_COLORS[theme] || DONUT_COLORS.light;
  const toneColor = (key) => palette[key] || palette.green;

  return (
    <div className="donut-wrap" style={{ "--donut-size": size + "px" }}>
      <svg
        className="donut-svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        data-hovered={hovered ? "" : null}
        onMouseLeave={() => onHover(null)}
      >
        {/* Track */}
        <circle cx="50" cy="50" r={R} fill="none"
          stroke={palette.track} strokeWidth={baseStroke} />
        {segs.map((s) => (
          <circle
            key={s.key}
            className="donut-slice"
            data-hot={hovered === s.key ? "" : null}
            cx="50" cy="50" r={R}
            stroke={toneColor(s.color)}
            strokeWidth={baseStroke}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={s.offset}
            strokeLinecap="butt"
            onMouseEnter={() => onHover(s.key)}
          />
        ))}
      </svg>
      <div className="donut-center">
        <div className="donut-eyebrow">{centerLabel}</div>
        <div className="donut-amount num-display"
             style={{ color: centerTone ? `var(--${centerTone})` : "var(--text-1)" }}>
          {centerAmount}
        </div>
        {centerPercent && <div className="donut-percent">{centerPercent}</div>}
      </div>
    </div>
  );
}

// ─── Hero card ────────────────────────────────────────────────────────────

function HeroCard({ stub, donutSize, theme }) {
  const [hovered, setHovered] = useState(null);

  const slices = [
    { key: "net",        label: "Net pay",   value: stub.net,                color: "green",  tone: "green-text"  },
    { key: "deductions", label: "Deductions",value: stub.deductions.total,   color: "blue",   tone: "blue-text"   },
    { key: "taxes",      label: "Taxes",     value: stub.taxes.total,        color: "red",    tone: "red-text"    },
  ];
  const hotSlice = slices.find((s) => s.key === hovered);

  const centerEyebrow  = hotSlice ? hotSlice.label : "Gross pay";
  const centerAmount   = hotSlice ? fmtMoney(hotSlice.value) : fmtMoney(stub.gross);
  const centerPct      = hotSlice
    ? `${((hotSlice.value / stub.gross) * 100).toFixed(1)}% of gross`
    : stub.rate;
  const centerTone     = hotSlice ? hotSlice.tone : null;

  return (
    <section className="card hero">
      <div className="hero-l">
        <div className="hero-top">
          <span className="eyebrow">Net pay deposited</span>
          <span className="hero-sub">
            Settled <b>{fmtDate(stub.date)}</b> · {stub.deposits.length} {stub.deposits.length === 1 ? "destination" : "destinations"}
          </span>
        </div>
        <div className="hero-display num-display">
          {(() => {
            const p = fmtMoneyParts(stub.net);
            return (<>${p.whole}<span className="cents">.{p.cents}</span></>);
          })()}
        </div>
        <div className="deposit-list">
          {stub.deposits.map((d, i) => (
            <div className="deposit-row" key={i}>
              <div className="bank">
                <span className="bank-dot"></span>
                {d.bank} <span className="last4">····{d.last4}</span>
              </div>
              <div className="amt num">{fmtMoney(d.amount)}</div>
            </div>
          ))}
        </div>
      </div>
      <Donut
        size={donutSize}
        slices={slices}
        hovered={hovered}
        onHover={setHovered}
        centerLabel={centerEyebrow}
        centerAmount={centerAmount}
        centerPercent={centerPct}
        centerTone={centerTone}
        theme={theme}
      />
    </section>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function EarningsCard({ stub }) {
  return (
    <section className="card banner-card">
      <div className="card-banner green">
        <span className="ttl">Earnings</span>
        <span className="meta">{stub.rate}</span>
      </div>
      <div className="card-body">
        <div className="lines">
          <LineRow label="Salary"   meta={`${stub.earnings.hours.toFixed(2)} hrs`} amount={stub.earnings.salary} />
          {stub.earnings.bonus > 0 && (
            <LineRow label="Annual bonus" meta="Supplemental" amount={stub.earnings.bonus} />
          )}
          <LineRow label="Gross earnings" amount={stub.gross} subtotal />
        </div>
      </div>
    </section>
  );
}

function DeductionsCard({ stub }) {
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
          <LineRow label="401(k) contribution" meta="6%"     amount={d.preTax.k401} />
          <LineRow label="FSA — Healthcare"    meta="$3,300/yr" amount={d.preTax.fsa} />
          <LineRow label="Medical premium"                       amount={d.preTax.medical} />
          <LineRow label="Dental premium"                        amount={d.preTax.dental} />
          <LineRow label="Vision premium"                        amount={d.preTax.vision} />
          {d.postTax.espp > 0 && (<>
            <SectionHd title="Post-tax" meta="After-tax buys" />
            <LineRow label="ESPP" meta="10% · STOCK" amount={d.postTax.espp} />
          </>)}
          <LineRow label="Total deductions" amount={d.total} subtotal />
        </div>
      </div>
    </section>
  );
}

function TaxesCard({ stub }) {
  const t = stub.taxes;
  return (
    <section className="card banner-card">
      <div className="card-banner red">
        <span className="ttl">Taxes</span>
        <span className="meta">Withheld at source</span>
      </div>
      <div className="card-body">
        <div className="lines">
          <LineRow label="Federal income tax" meta={stub.w4 === "new" ? "W4: $7,097 claim" : "W4: $0 claim"} amount={t.fit} />
          <LineRow label="Social Security"   meta="6.2%"  amount={t.fica} />
          <LineRow label="Medicare"          meta="1.45%" amount={t.med} />
          <LineRow label="Ohio state tax"    meta="~3.2%" amount={t.state} />
          <LineRow label="Total taxes" amount={t.total} subtotal />
        </div>
      </div>
    </section>
  );
}

function EmployerCard({ stub }) {
  const e = stub.employer;
  return (
    <section className="card banner-card">
      <div className="card-banner purple">
        <span className="ttl">Employer contributions</span>
        <span className="meta">On top of your pay</span>
      </div>
      <div className="card-body">
        <div className="lines" style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px"}}>
          <div className="lines" style={{gridColumn:"1"}}>
            <SectionHd title="Benefits" />
            <LineRow label="401(k) match"        meta="3% safe harbor"   amount={e.k401Match} />
            <LineRow label="Health premium"      meta="Employer share"   amount={e.health} />
            <LineRow label="Dental premium"      meta="Employer share"   amount={e.dental} />
            <LineRow label="LTD insurance"       meta="Long-term disab." amount={e.ltd} />
            <LineRow label="GTLI"                meta="Group term life"  amount={e.gtli} />
          </div>
          <div className="lines" style={{gridColumn:"2"}}>
            <SectionHd title="Payroll taxes" meta="Employer-side" />
            <LineRow label="Social Security match" meta="6.2%"   amount={e.fica} />
            <LineRow label="Medicare match"        meta="1.45%"  amount={e.medicare} />
            <LineRow label="FUTA"                  meta="Federal unemp." amount={e.futa} />
            <LineRow label="SUTA"                  meta="State unemp."  amount={e.suta} />
          </div>
          <div style={{gridColumn:"1 / -1"}}>
            <LineRow label="Total employer-paid" amount={e.total} subtotal />
          </div>
        </div>
      </div>
    </section>
  );
}

function ImputedFootnote({ stub }) {
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
        <div className="ftn-amt"><span className="k">LTD</span><span className="v num">{fmtMoney(i.ltd)}</span></div>
        <div className="ftn-amt"><span className="k">GTLI</span><span className="v num">{fmtMoney(i.gtli)}</span></div>
      </div>
    </aside>
  );
}

// ─── Single-stub view ─────────────────────────────────────────────────────

function SingleStubView({ stub, idx, total, onPrev, onNext, donutSize, theme }) {
  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">{fmtDate(stub.date)}</div>
          <div className="stub-meta">
            <b>{stub.period}</b> · Voucher {stub.voucher} · {stub.rate}
            {stub.bonus > 0 && <> · <span style={{color:"var(--green-text)"}}>+ Bonus stub</span></>}
          </div>
        </div>
        <div className="stub-nav">
          <button onClick={onPrev} disabled={idx === 0} aria-label="Previous stub">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11L5 7l4-4"/></svg>
          </button>
          <span className="of num">Stub <b>{idx + 1}</b> of {total}</span>
          <button onClick={onNext} disabled={idx === total - 1} aria-label="Next stub">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l4 4-4 4"/></svg>
          </button>
        </div>
      </div>

      <div className="stack">
        <HeroCard stub={stub} donutSize={donutSize} theme={theme} />
        <div className="row-pair">
          <DeductionsCard stub={stub} />
          <TaxesCard stub={stub} />
        </div>
        <EmployerCard stub={stub} />
        <ImputedFootnote stub={stub} />
      </div>
    </>
  );
}

// ─── Placeholder views for All / YTD tabs ─────────────────────────────────

function PlaceholderView({ kind }) {
  return (
    <div className="empty">
      <div className="schematic">{kind}</div>
      <div>Tab not part of this pass — see the <b style={{color:"var(--text-2)"}}>Single stub</b> tab for the full layout.</div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stubIdx, setStubIdx] = useState(STUBS.length - 1); // most recent

  const stub = useMemo(() => computeStub(STUBS[stubIdx]), [stubIdx]);

  // Sync theme + density + wireframe + tab into <html>
  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.setAttribute("data-wireframe", t.wireframe ? "on" : "off");
  }, [t.theme, t.density, t.wireframe]);

  return (
    <>
      <div className="page">
        <header className="page-hd">
          <div>
            <div className="crumbs">
              <span>Vault</span>
              <span className="sep">/</span>
              <span>Income</span>
              <span className="sep">/</span>
              <span className="here">Payroll</span>
            </div>
            <h1 className="page-title">Income · Payroll</h1>
          </div>
          <button
            className="mode-toggle"
            onClick={() => setTweak("theme", t.theme === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {t.theme === "light" ? (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 8.2A4.5 4.5 0 0 1 5.8 2.5 4.5 4.5 0 1 0 11.5 8.2z"/></svg> Dark</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="2.4"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M2.6 11.4l1-1M10.4 3.6l1-1"/></svg> Light</>
            )}
          </button>
        </header>

        <nav className="tabs" role="tablist">
          {[
            { id: "single", label: "Single stub", count: 13 },
            { id: "all",    label: "All stubs",   count: 13 },
            { id: "ytd",    label: "YTD summary", count: null },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              className={"tab" + (t.activeTab === tab.id ? " active" : "")}
              onClick={() => setTweak("activeTab", tab.id)}
            >
              {tab.label}
              {tab.count != null && <span className="count num">{tab.count}</span>}
            </button>
          ))}
        </nav>

        {t.activeTab === "single" && (
          <SingleStubView
            stub={stub}
            idx={stubIdx}
            total={STUBS.length}
            onPrev={() => setStubIdx((i) => Math.max(0, i - 1))}
            onNext={() => setStubIdx((i) => Math.min(STUBS.length - 1, i + 1))}
            donutSize={t.donutSize}
            theme={t.theme}
          />
        )}
        {t.activeTab === "all" && (
          <AllStubsView
            onJumpToStub={(id) => {
              const idx = STUBS.findIndex(s => s.id === id);
              if (idx >= 0) {
                setStubIdx(idx);
                setTweak("activeTab", "single");
              }
            }}
          />
        )}
        {t.activeTab === "ytd" && (
          <YTDView
            onJumpToStub={(id) => {
              const idx = STUBS.findIndex(s => s.id === id);
              if (idx >= 0) {
                setStubIdx(idx);
                setTweak("activeTab", "single");
              }
            }}
          />
        )}
      </div>

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio
          label="Theme"
          value={t.theme}
          options={["light", "dark"]}
          onChange={(v) => setTweak("theme", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="Wireframe mode"
          value={t.wireframe}
          onChange={(v) => setTweak("wireframe", v)}
        />

        <TweakSection label="Donut" />
        <TweakSlider
          label="Diameter"
          value={t.donutSize}
          min={220} max={400} step={10} unit="px"
          onChange={(v) => setTweak("donutSize", v)}
        />

        <TweakSection label="Stub" />
        <TweakSelect
          label="Pay period"
          value={String(stubIdx)}
          options={STUBS.map((s, i) => ({
            value: String(i),
            label: fmtDate(s.date) + (s.bonus > 0 ? "  · bonus" : ""),
          }))}
          onChange={(v) => setStubIdx(parseInt(v, 10))}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
