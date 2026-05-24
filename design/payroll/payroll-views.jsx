// payroll-views.jsx — Shared line-row primitives + YTD Summary + All Stubs list views.

const { useState: useStateV, useMemo: useMemoV } = React;

// Babel-transpiled scripts don't share scope; pull dependencies from window.
const { STUBS, EVENTS, computeStub, computeYTD,
        fmtMoney, fmtMoneyParts, fmtDate, fmtDateShort, fmtMonth } = window;

// ─── Line-row primitives (shared) ────────────────────────────────────────

function LineRow({ label, meta, amount, subtotal }) {
  return (
    <div className={"line-row" + (subtotal ? " subtotal" : "")}>
      <div className="lbl">{label}</div>
      <div className="meta num">{meta}</div>
      <div className="amt num">{fmtMoney(amount)}</div>
    </div>
  );
}

function SectionHd({ title, meta }) {
  return (
    <div className="line-section-hd">
      <div className="eyebrow">{title}</div>
      {meta && <div className="meta" style={{color:"var(--text-3)", fontSize:12}}>{meta}</div>}
    </div>
  );
}

// ─── YTD Summary ─────────────────────────────────────────────────────────

function YTDView({ onJumpToStub }) {
  const [year, setYear] = useStateV(2025);
  const [hoverIdx, setHoverIdx] = useStateV(null);

  const ytd = useMemoV(() => computeYTD(year), [year]);
  const isPartial = ytd.stubCount < 12;

  // Event lookup keyed by stub date
  const eventsForYear = EVENTS.filter(e => e.stubDate.startsWith(String(year)));
  const eventByDate = Object.fromEntries(eventsForYear.map(e => [e.stubDate, e]));

  // Chart scale
  const maxStubGross = Math.max(...ytd.stubs.map(s => s.gross));

  const avgNet = ytd.stubCount > 0 ? ytd.net / ytd.stubCount : 0;

  return (
    <>
      <div className="stub-bar">
        <div className="stub-bar-l">
          <div className="stub-date">{year} Year-to-date</div>
          <div className="stub-meta">
            <b>{ytd.stubCount} {ytd.stubCount === 1 ? "stub" : "stubs"}</b>
            {isPartial && <> · <span style={{color:"var(--amber-text)"}}>Partial year</span></>}
            {" · "}aggregated from CBIZ payroll
          </div>
        </div>
        <div className="ytd-year-tabs">
          {[2025, 2026].map(y => {
            const stubs = STUBS.filter(s => s.date.startsWith(String(y)));
            const partial = stubs.length < 12;
            return (
              <button
                key={y}
                className={"ytd-year-tab" + (year === y ? " active" : "")}
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
        {/* HERO: YTD net pay deposited */}
        <section className="card ytd-hero">
          <div className="ytd-hero-l">
            <span className="eyebrow">Net pay deposited · YTD {year}</span>
            <div className="ytd-hero-display num-display">
              {(() => {
                const p = fmtMoneyParts(ytd.net);
                return (<>${p.whole}<span className="cents">.{p.cents}</span></>);
              })()}
            </div>
            <div className="ytd-hero-sub">
              <span>Gross <b>{fmtMoney(ytd.gross)}</b></span>
              <span>· Taxes (yours) <b>{fmtMoney(ytd.taxesYours)}</b></span>
              <span>· Deductions <b>{fmtMoney(ytd.deductionsTotal)}</b></span>
            </div>
          </div>
          <div className="ytd-hero-r">
            <span className="avg-lbl">Avg / stub</span>
            <span className="avg num">{fmtMoney(avgNet)}</span>
          </div>
        </section>

        {/* 4 metric cards */}
        <div className="ytd-grid">
          <section className="card ytd-metric">
            <span className="lbl">Gross earnings</span>
            <span className="val num">{fmtMoney(ytd.gross)}</span>
            <span className="pct">{ytd.bonus > 0 ? `incl. ${fmtMoney(ytd.bonus)} bonus` : "Salary only"}</span>
          </section>
          <section className="card ytd-metric red">
            <span className="lbl">Taxes withheld</span>
            <span className="val num">{fmtMoney(ytd.taxesYours)}</span>
            <span className="pct">{((ytd.taxesYours / ytd.gross) * 100).toFixed(1)}% effective</span>
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

        {/* Monthly bar chart */}
        <section className="card ytd-chart">
          <div className="ytd-chart-hd">
            <span className="ttl">Monthly breakdown</span>
            <span className="lgnd">
              <span className="sw"><span className="dot" style={{background:"var(--green)"}}></span> Net</span>
              <span className="sw"><span className="dot" style={{background:"var(--blue)"}}></span> Deductions</span>
              <span className="sw"><span className="dot" style={{background:"var(--red)"}}></span> Taxes</span>
            </span>
          </div>
          <div
            className="ytd-chart-body"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {ytd.stubs.map((s, i) => {
              const evt = eventByDate[s.date];
              const netPct  = (s.net / maxStubGross) * 100;
              const dedPct  = (s.deductions.total / maxStubGross) * 100;
              const taxPct  = (s.taxes.total / maxStubGross) * 100;
              const dimmed  = hoverIdx != null && hoverIdx !== i;
              return (
                <div
                  key={s.id}
                  className={"ytd-bar-col" + (dimmed ? " dimmed" : "")}
                  onMouseEnter={() => setHoverIdx(i)}
                  onClick={() => onJumpToStub(s.id)}
                  title={`${fmtDate(s.date)} · Gross ${fmtMoney(s.gross)} · Net ${fmtMoney(s.net)}`}
                >
                  <div className={"ytd-bar-evt " + (evt ? evt.tone : "")} style={evt ? {} : {visibility:"hidden"}}></div>
                  <div className="ytd-bar-stack" style={{height: 150}}>
                    <div className="ytd-bar-seg net"    style={{height: `${netPct}%`}}></div>
                    <div className="ytd-bar-seg deduct" style={{height: `${dedPct}%`}}></div>
                    <div className="ytd-bar-seg tax"    style={{height: `${taxPct}%`}}></div>
                  </div>
                  <div className="ytd-bar-lbl">{fmtMonth(s.date)}</div>
                </div>
              );
            })}
          </div>
          {hoverIdx != null && ytd.stubs[hoverIdx] && (() => {
            const s = ytd.stubs[hoverIdx];
            return (
              <div style={{
                padding: "10px 18px 16px", borderTop: "1px solid var(--line)",
                display: "grid", gridTemplateColumns: "1fr repeat(4, auto)", gap: 16,
                fontSize: 13, alignItems: "baseline",
              }}>
                <div>
                  <div style={{fontSize: 13, fontWeight: 600, color: "var(--text-1)"}}>{fmtDate(s.date)}</div>
                  <div style={{fontSize: 11, color: "var(--text-3)"}}>{s.period}</div>
                </div>
                <div>
                  <div style={{fontSize: 10, color: "var(--text-3)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>Gross</div>
                  <div className="num" style={{fontWeight: 600}}>{fmtMoney(s.gross)}</div>
                </div>
                <div>
                  <div style={{fontSize: 10, color: "var(--green-text)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>Net</div>
                  <div className="num" style={{fontWeight: 600, color: "var(--green-text)"}}>{fmtMoney(s.net)}</div>
                </div>
                <div>
                  <div style={{fontSize: 10, color: "var(--blue-text)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>Deductions</div>
                  <div className="num" style={{fontWeight: 600, color: "var(--blue-text)"}}>{fmtMoney(s.deductions.total)}</div>
                </div>
                <div>
                  <div style={{fontSize: 10, color: "var(--red-text)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase"}}>Taxes</div>
                  <div className="num" style={{fontWeight: 600, color: "var(--red-text)"}}>{fmtMoney(s.taxes.total)}</div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Two-col: Where it went + Events */}
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
                <LineRow label="Total retirement + stock" amount={+(ytd.k401Contrib + ytd.k401Match + ytd.espp).toFixed(2)} subtotal />
              </div>
            </div>
          </section>

          <section className="card banner-card">
            <div className="card-banner amber">
              <span className="ttl">Year events</span>
              <span className="meta">{eventsForYear.length} {eventsForYear.length === 1 ? "change" : "changes"}</span>
            </div>
            <div className="card-body" style={{padding: 0}}>
              <div className="ytd-events">
                {eventsForYear.length === 0 && (
                  <div style={{padding: "18px", color: "var(--text-3)", fontSize: 13, textAlign:"center"}}>
                    No notable changes this year
                  </div>
                )}
                {eventsForYear.map((e, i) => (
                  <div key={i} className="ytd-event">
                    <div className={"swatch " + e.tone}></div>
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

        {/* Tax breakdown */}
        <section className="card banner-card">
          <div className="card-banner red">
            <span className="ttl">Tax breakdown · YTD {year}</span>
            <span className="meta">Yours · {fmtMoney(ytd.taxesYours)}</span>
          </div>
          <div className="card-body">
            <div className="lines" style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px"}}>
              <div className="lines">
                <LineRow label="Federal income tax" meta="FIT"  amount={ytd.fit} />
                <LineRow label="Ohio state tax"     meta="~3.2%" amount={ytd.state} />
              </div>
              <div className="lines">
                <LineRow label="Social Security"   meta="6.2%"  amount={ytd.fica} />
                <LineRow label="Medicare"          meta="1.45%" amount={ytd.medicare} />
              </div>
              <div style={{gridColumn:"1 / -1"}}>
                <LineRow label="Total · withheld from your pay" amount={ytd.taxesYours} subtotal />
                <div style={{
                  padding: "10px 0 0", fontSize: 12, color: "var(--text-3)",
                  display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 8,
                }}>
                  <span>+ Employer-paid payroll taxes (FICA match, Medicare match, FUTA, SUTA)</span>
                  <span className="num" style={{color:"var(--text-2)", fontWeight: 500}}>{fmtMoney(ytd.taxesEmployer)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}


// ─── All Stubs list ──────────────────────────────────────────────────────

function AllStubsView({ onJumpToStub }) {
  const [yearFilter, setYearFilter] = useStateV("all"); // "all" | 2025 | 2026

  const eventByDate = Object.fromEntries(EVENTS.map(e => [e.stubDate, e]));

  const rows = useMemoV(() => {
    return STUBS.map(computeStub).filter(s => {
      if (yearFilter === "all") return true;
      return s.date.startsWith(String(yearFilter));
    });
  }, [yearFilter]);

  const years = ["all", 2025, 2026];

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
          {years.map(y => (
            <button
              key={String(y)}
              className={"ytd-year-tab" + (yearFilter === y ? " active" : "")}
              onClick={() => setYearFilter(y)}
            >
              {y === "all" ? "All" : y}
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
          {rows.map(s => {
            const evt = eventByDate[s.date];
            const chips = [];
            if (s.bonus > 0) chips.push({ tone: "purple", label: "Bonus" });
            if (evt) chips.push({ tone: evt.tone, label: evt.label });
            if (s.w4 === "new" && s.date < "2025-12-01") {
              // first stub of "new" W4 — already covered by event chip on Oct 2025
            }

            return (
              <div
                key={s.id}
                className="stub-list-row"
                onClick={() => onJumpToStub(s.id)}
              >
                <div className="col-date">
                  <span className="d">{fmtDate(s.date)}</span>
                  <span className="v">{s.voucher}</span>
                </div>
                <div className="col-period">
                  <span className="p">{s.period}</span>
                  {chips.length > 0 && (
                    <span className="evts">
                      {chips.map((c, i) => (
                        <span key={i} className={"evt-chip " + c.tone}>{c.label}</span>
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

Object.assign(window, { LineRow, SectionHd, YTDView, AllStubsView });
