// accounts-views-v1plus.jsx — Enhanced V1 with NW chart, sidebar summary,
// collapsible groups, and sparklines.

const { useState: useStateP, useMemo: useMemoP, useRef: useRefP, useEffect: useEffectP } = React;
const {
  ACCOUNTS, TYPE_META, GROUP_ORDER, SUBGROUP_ORDER,
  summarize, fmtMoneyA, fmtMoneyAShort, fmtPct, fmtRelDate,
  NW_SERIES, nwSeriesForRange, generateSparkline, groupDelta30,
} = window;

// ─── Inline primitives (formerly in accounts-views.jsx) ───────────────────

// Institution name → domain for favicon lookup
const INSTITUTION_DOMAINS = {
  "Chase":             "chase.com",
  "Ally Bank":         "ally.com",
  "Capital One":       "capitalone.com",
  "Bank of America":   "bankofamerica.com",
  "U.S. Bank":         "usbank.com",
  "Goldman Sachs":     "marcus.com",
  "Fidelity":          "fidelity.com",
  "Vanguard":          "vanguard.com",
  "E*TRADE":           "etrade.com",
  "Coinbase":          "coinbase.com",
  "Nelnet":            "nelnet.com",
  "Honda Financial":   "hondafinancialservices.com",
  "Discover":          "discover.com",
  "American Express":  "americanexpress.com",
};

function instDomain(institution) {
  if (!institution) return null;
  if (INSTITUTION_DOMAINS[institution]) return INSTITUTION_DOMAINS[institution];
  return institution.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
}

function InstLogo({ institution }) {
  const domain = instDomain(institution);
  const initial = (institution || "?")
    .split(/[\s-*]/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const [failed, setFailed] = React.useState(false);
  return (
    <span className="inst-logo">
      {!failed && domain ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={institution || ""}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="fallback">{initial}</span>
      )}
    </span>
  );
}

function Delta({ amount }) {
  if (amount === 0 || amount == null) return <span className="delta zero num">·</span>;
  const cls = amount > 0 ? "pos" : "neg";
  const arrow = amount > 0 ? "▲" : "▼";
  return (
    <span className={"delta " + cls}>
      <span className="arrow">{arrow}</span>
      <span className="num">{fmtMoneyA(Math.abs(amount), { decimals: 2 })}</span>
    </span>
  );
}

// Bucket accounts by subgroup. Returns array in SUBGROUP_ORDER, or a single
// bucket with name=null if the group has no subgroups defined (e.g. Cash).
function bucketBySubgroup(rows, groupName) {
  const order = SUBGROUP_ORDER[groupName];
  if (!order) {
    return [{ name: null, rows, total: rows.reduce((s, r) => s + r.balance, 0) }];
  }
  const buckets = {};
  for (const r of rows) {
    const sg = TYPE_META[r.type]?.subgroup;
    if (!sg) continue;
    if (!buckets[sg]) buckets[sg] = [];
    buckets[sg].push(r);
  }
  return order
    .filter(sg => buckets[sg]?.length)
    .map(sg => ({
      name: sg,
      rows: buckets[sg],
      total: buckets[sg].reduce((s, r) => s + r.balance, 0),
    }));
}

// ─── Net-worth area chart ─────────────────────────────────────────────────

function NWChart({ range, onRangeChange, customRange, onCustomRange }) {
  // Resolve series for the current range (preset OR custom)
  const series = range === "Custom" && customRange
    ? nwSeriesForRange(customRange.from, customRange.to)
    : NW_SERIES[range] || NW_SERIES["1M"];
  const [hoverIdx, setHoverIdx] = useStateP(null);
  const [showPicker, setShowPicker] = useStateP(false);
  const svgRef = useRefP(null);
  const wrapRef = useRefP(null);
  const [size, setSize] = useStateP({ w: 800, h: 220 });

  useEffectP(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const padT = 14, padB = 28, padL = 50, padR = 16;
  const innerW = Math.max(10, W - padL - padR);
  const innerH = Math.max(10, H - padT - padB);

  if (series.length < 2) {
    return (
      <section className="card nw-chart-card">
        <div className="nw-chart-hd">
          <div className="nw-chart-hd-l">
            <span className="lbl">Net worth</span>
            <span className="val num-display">{fmtMoneyA(117489)}</span>
            <span className="change"><span>Not enough data in range</span></span>
          </div>
        </div>
        <div style={{padding: "60px 20px", textAlign:"center", color:"var(--text-3)", fontSize: 13}}>
          Range is too narrow — pick a wider window.
        </div>
      </section>
    );
  }

  const values = series.map(p => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range01 = maxV - minV || 1;
  const padPct = 0.08;
  const yMin = minV - range01 * padPct;
  const yMax = maxV + range01 * padPct;

  const x = (i) => padL + (i / (series.length - 1)) * innerW;
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${x(series.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const first = series[0].value;
  const last = series[series.length - 1].value;
  const change = last - first;
  const changePct = (change / first) * 100;
  const changeCls = change > 0 ? "pos" : change < 0 ? "neg" : "";
  const changeArrow = change > 0 ? "↗" : change < 0 ? "↘" : "·";

  const rangeLabel = {
    "7D":  "7-day change",
    "1M":  "1-month change",
    "3M":  "3-month change",
    "6M":  "6-month change",
    "YTD": "Year-to-date change",
    "1Y":  "1-year change",
    "2Y":  "2-year change",
    "All": "All-time change",
    "Custom": "Custom range change",
  }[range];

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const idx = Math.round(((xPx - padL) / innerW) * (series.length - 1));
    if (idx >= 0 && idx < series.length) setHoverIdx(idx);
    else setHoverIdx(null);
  };

  const yTicks = [yMin + (yMax - yMin) * 0.2, yMin + (yMax - yMin) * 0.55, yMin + (yMax - yMin) * 0.9];

  const formatXTick = (iso) => {
    const d = new Date(iso + "T00:00:00");
    if (range === "1Y" || range === "2Y" || range === "All") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const ranges = ["7D", "1M", "3M", "6M", "YTD", "1Y", "2Y", "All"];
  const hovered = hoverIdx != null ? series[hoverIdx] : null;

  // Default custom range: last 14 days
  const defaultCustom = {
    from: "2026-05-05",
    to:   "2026-05-19",
  };

  return (
    <section className="card nw-chart-card">
      <div className="nw-chart-hd">
        <div className="nw-chart-hd-l">
          <span className="lbl">Net worth</span>
          <span className="val num-display">{fmtMoneyA(hovered ? hovered.value : last)}</span>
          <span className="change">
            <span className={changeCls}>
              <span className="arrow">{changeArrow}</span>{" "}
              {fmtMoneyA(Math.abs(change), { decimals: 2 })} ({changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%)
            </span>
            <span>{rangeLabel}</span>
          </span>
        </div>
        <div className="nw-chart-hd-r">
          <div className="range-toggle">
            {ranges.map(r => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => onRangeChange(r)}>{r}</button>
            ))}
            <button
              className={range === "Custom" ? "active" : ""}
              onClick={() => {
                if (range !== "Custom") {
                  onRangeChange("Custom");
                  if (!customRange) onCustomRange(defaultCustom);
                }
                setShowPicker(s => !s);
              }}
              style={{display: "inline-flex", alignItems: "center", gap: 4}}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="2.5" width="9" height="8" rx="1"/><path d="M1.5 5.5h9M4 1.5v2M8 1.5v2"/></svg>
              Custom
            </button>
          </div>
        </div>
      </div>
      {showPicker && range === "Custom" && (
        <div className="custom-range-popover">
          <div className="row">
            <label>From
              <input type="date" value={(customRange || defaultCustom).from}
                     min="2024-08-01" max={(customRange || defaultCustom).to}
                     onChange={(e) => onCustomRange({ ...(customRange || defaultCustom), from: e.target.value })} />
            </label>
            <label>To
              <input type="date" value={(customRange || defaultCustom).to}
                     min={(customRange || defaultCustom).from} max="2026-05-19"
                     onChange={(e) => onCustomRange({ ...(customRange || defaultCustom), to: e.target.value })} />
            </label>
            <button className="apply" onClick={() => setShowPicker(false)}>Done</button>
          </div>
        </div>
      )}
      <div className="nw-chart-body" ref={wrapRef}>
        <svg className="nw-chart-svg" ref={svgRef}
             onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            <linearGradient id="nw-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#16a34a" stopOpacity="0.22" />
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
          {hovered && (
            <>
              <line className="hover-line" x1={x(hoverIdx)} x2={x(hoverIdx)} y1={padT} y2={padT + innerH} />
              <circle className="hover-dot" cx={x(hoverIdx)} cy={y(hovered.value)} r="4.5" />
            </>
          )}
        </svg>
        {hovered && (
          <div className="nw-tooltip" style={{
            left: Math.min(W - 160, Math.max(8, x(hoverIdx) - 70)),
            top:  Math.max(6, y(hovered.value) - 56),
          }}>
            <div className="dt">{new Date(hovered.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            <div className="vl num">{fmtMoneyA(hovered.value)}</div>
          </div>
        )}
      </div>
      <div className="nw-chart-x">
        <span>{formatXTick(series[0].date)}</span>
        <span>{formatXTick(series[Math.floor(series.length / 2)].date)}</span>
        <span>{formatXTick(series[series.length - 1].date)}</span>
      </div>
    </section>
  );
}

// ─── Sparkline ───────────────────────────────────────────────────────────

function Sparkline({ account }) {
  const pts = useMemoP(() => generateSparkline(account), [account.id]);
  const W = 90, H = 28;
  const minV = Math.min(...pts), maxV = Math.max(...pts);
  const rng = maxV - minV || 1;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - ((v - minV) / rng) * (H - 4) - 2;

  const linePath = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${W},${H} L0,${H} Z`;

  const delta = pts[pts.length - 1] - pts[0];
  // For liabilities, an increase in balance number = more debt = "down" semantically
  const isLiability = account.balance < 0 || ["credit_summary", "loan"].includes(account.type);
  const cls = Math.abs(delta) < 1 ? "flat"
    : isLiability ? (delta > 0 ? "down" : "up")
    : (delta > 0 ? "up" : "down");

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path className={"spark-area " + cls} d={areaPath} />
      <path className={"spark-line " + cls} d={linePath} />
    </svg>
  );
}

// ─── Composition card (replaces the sidebar) ─────────────────────────────

// Segment definitions used by both the composition bar AND the row coloring.
// Each segment bundles 1+ account types into one visual unit.
const ASSET_SEGMENTS = [
  { key: "checking",   name: "Checking",          color: "#2563eb", types: ["checking"] },
  { key: "savings",    name: "Savings",           color: "#16a34a", types: ["savings"] },
  { key: "retirement", name: "Retirement",        color: "#0891b2", types: ["retirement"] },
  { key: "taxable",    name: "Taxable brokerage", color: "#7c3aed", types: ["brokerage", "espp"] },
  { key: "crypto",     name: "Crypto",            color: "#b45309", types: ["crypto"] },
];
const LIAB_SEGMENTS = [
  { key: "credit", name: "Credit cards", color: "#dc2626", types: ["credit_summary"] },
  { key: "loans",  name: "Loans",        color: "#9a3412", types: ["loan"] },
];

function segmentize(accounts, segments) {
  return segments
    .map(s => ({
      ...s,
      total: accounts
        .filter(a => s.types.includes(a.type))
        .reduce((sum, a) => sum + Math.abs(a.balance), 0),
    }))
    .filter(s => s.total > 0);
}

function Composition({ accounts }) {
  const active = accounts.filter(a => !a.closed);
  const assets = segmentize(active, ASSET_SEGMENTS);
  const liabs  = segmentize(active, LIAB_SEGMENTS);

  const assetsTotal = assets.reduce((s, g) => s + g.total, 0);
  const liabsTotal  = liabs.reduce((s, g) => s + g.total, 0);
  const netWorth = assetsTotal - liabsTotal;

  const renderBar = (groups, total) => groups.map((g) => {
    const pct = (g.total / total) * 100;
    const isTiny  = pct < 5;
    const isSmall = !isTiny && pct < 14;
    const cls = "comp-seg" + (isTiny ? " tiny" : isSmall ? " small" : "");
    return (
      <div
        key={g.key}
        className={cls}
        style={{ width: pct + "%", background: g.color }}
        title={`${g.name} · ${fmtMoneyA(g.total)} (${pct.toFixed(1)}%)`}
      >
        {!isTiny && (<>
          <span className="seg-name">{g.name}</span>
          <span className="seg-amt num">{fmtMoneyAShort(g.total)}</span>
        </>)}
      </div>
    );
  });

  return (
    <section className="card composition">
      <div className="comp-hd">
        <span className="ttl">Composition</span>
        <span className="nw">
          <span className="lbl">Net worth</span>{fmtMoneyA(netWorth)}
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

// ─── V1+ (enhanced sectioned list) ───────────────────────────────────────

function accountMetaForRow(a) {
  switch (a.type) {
    case "checking":
    case "savings":
      return { primary: a.apy != null ? `${a.apy.toFixed(2)}% APY` : "—",
               secondary: a.dormant ? "Dormant" : null };
    case "credit_summary":
      return { primary: `${a.cardCount} cards · ${a.util}% util`,
               secondary: `${fmtMoneyAShort(a.availableCredit)} avail` };
    case "brokerage":
    case "retirement":
    case "espp":
    case "crypto":
      return { primary: a.gainPct != null ? fmtPct(a.gainPct) : "—",
               secondary: a.gainAmt != null ? fmtMoneyA(a.gainAmt, { sign: true }) : null };
    case "loan":
      return { primary: a.apy != null ? `${a.apy.toFixed(2)}% APR` : "—",
               secondary: a.monthlyPayment ? `${fmtMoneyA(a.monthlyPayment, { decimals: 0 })}/mo` : null };
    default: return { primary: "—", secondary: null };
  }
}

// ─── Account card (grid view) ────────────────────────────────────────────

function AccountCard({ a, isLiab }) {
  const meta = TYPE_META[a.type];
  const m = accountMetaForRow(a);
  const isCcSummary = a.type === "credit_summary";
  const Tag = isCcSummary ? "a" : "div";
  const tagProps = isCcSummary ? { href: "Credit Cards.html" } : {};
  return (
    <Tag
      {...tagProps}
      className={"gv-card" + (isLiab ? " liability" : "") + (isCcSummary ? " linkable" : "")}
    >
      <div className="gv-top">
        <InstLogo institution={a.institution} />
        <div className="gv-id">
          <div className="gv-name">{a.name}</div>
          <div className="gv-sub">
            {a.institution}{a.last4 ? ` · ····${a.last4}` : ""}
          </div>
        </div>
      </div>
      <div className="gv-bal-row">
        <span className="gv-bal num-display">{fmtMoneyA(Math.abs(a.balance))}</span>
        <Delta amount={a.delta30} />
      </div>
      <div className="gv-spark"><Sparkline account={a} /></div>
      <div className="gv-foot">
        <span className="gv-meta">
          <b>{m.primary}</b>{m.secondary ? m.secondary : ""}
        </span>
        <span>{fmtRelDate(a.lastActivity)}</span>
      </div>
    </Tag>
  );
}

function V1Plus() {
  const [tab, setTab] = useStateP("active");
  const [view, setView] = useStateP("list"); // 'list' | 'grid'
  const [range, setRange] = useStateP("1M");
  const [customRange, setCustomRange] = useStateP(null);
  const [openGroups, setOpenGroups] = useStateP({ Cash: true, Investments: true, Liabilities: true });
  const [showHidden, setShowHidden] = useStateP(false);

  const active = ACCOUNTS.filter(a => !a.closed);
  const closed = ACCOUNTS.filter(a => a.closed);
  const data = tab === "closed" ? closed : active;

  const groups = useMemoP(() => {
    const out = { Cash: [], Investments: [], Liabilities: [] };
    for (const a of data) {
      const g = TYPE_META[a.type]?.group;
      if (g && out[g]) out[g].push(a);
    }
    return out;
  }, [tab]);

  const toggle = (g) => setOpenGroups(s => ({ ...s, [g]: !s[g] }));

  return (
    <div className="page">
      <header className="page-hd">
        <div>
          <div className="crumbs"><span>Vault</span> <span style={{opacity:.5}}>/</span> <span className="here">Accounts</span></div>
          <h1 className="page-title">Accounts</h1>
        </div>
        <div className="page-actions">
          <div className="view-toggle" role="tablist" aria-label="View">
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
              role="tab" aria-selected={view === "list"}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 4h10M2 7h10M2 10h10"/></svg>
              List
            </button>
            <button
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
              role="tab" aria-selected={view === "grid"}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="2" width="4" height="4" rx="0.8"/><rect x="8" y="2" width="4" height="4" rx="0.8"/><rect x="2" y="8" width="4" height="4" rx="0.8"/><rect x="8" y="8" width="4" height="4" rx="0.8"/></svg>
              Grid
            </button>
          </div>
          <button className="pg-btn primary">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2v10M2 7h10"/></svg>
            Add account
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button className={"tab" + (tab === "active" ? " active" : "")} onClick={() => setTab("active")}>
          Active <span className="count num">{active.length}</span>
        </button>
        <button className={"tab" + (tab === "closed" ? " active" : "")} onClick={() => setTab("closed")}>
          Closed <span className="count num">{closed.length}</span>
        </button>
      </nav>

      <div className="v1plus-layout">
        <div className="v1plus-main">
          {tab === "active" && (
            <NWChart
              range={range}
              onRangeChange={setRange}
              customRange={customRange}
              onCustomRange={setCustomRange}
            />
          )}

          {tab === "active" && <Composition accounts={ACCOUNTS} />}

          {tab === "closed" && data.length === 0 && (
            <div className="card closed-state" style={{marginTop:16}}>No closed accounts.</div>
          )}

          <div>
            {GROUP_ORDER.map(g => {
              const rows = groups[g] || [];
              if (rows.length === 0) return null;
              const groupTotal = rows.reduce((s, a) => s + a.balance, 0);
              const groupDelta = groupDelta30(rows);
              const isOpen = openGroups[g];
              const isLiab = g === "Liabilities";

              if (view === "grid") {
                return (
                  <section key={g} className={"gv-section" + (isOpen ? " open" : "") + (isLiab ? " liabilities" : "")}>
                    <div className="gv-section-hd" onClick={() => toggle(g)}>
                      <span className="caret">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 1.5L7 5l-3.5 3.5"/></svg>
                      </span>
                      <span className="ttl">
                        {g}
                        <span className="n">{rows.length} {rows.length === 1 ? "account" : "accounts"}</span>
                      </span>
                      <span className="delta-col"><Delta amount={groupDelta} /></span>
                      <span className="bal num">{fmtMoneyA(Math.abs(groupTotal))}</span>
                    </div>
                    <div className="gv-section-body">
                      {bucketBySubgroup(rows, g).map((sub) => (
                        <React.Fragment key={sub.name || "_flat"}>
                          {sub.name && (
                            <div className="gv-sub-hd">
                              <span className="ttl">
                                {sub.name}
                                <span className="n">{sub.rows.length} {sub.rows.length === 1 ? "account" : "accounts"}</span>
                              </span>
                              <span className="total num">{fmtMoneyA(Math.abs(sub.total))}</span>
                            </div>
                          )}
                          <div className="gv-grid">
                            {sub.rows.map(a => (
                              <AccountCard key={a.id} a={a} isLiab={isLiab} />
                            ))}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </section>
                );
              }

              return (
                <div key={g} className={"v1-group" + (isOpen ? " open" : "") + (isLiab ? " liabilities" : "")}>
                  <div className="v1-group-hd" onClick={() => toggle(g)}>
                    <span className="caret">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 1.5L7 5l-3.5 3.5"/></svg>
                    </span>
                    <span className="ttl">
                      {g}
                      <span className="n">{rows.length} {rows.length === 1 ? "account" : "accounts"}</span>
                    </span>
                    <span className="delta-col"><Delta amount={groupDelta} /></span>
                    <span className="bal num">{fmtMoneyA(Math.abs(groupTotal))}</span>
                  </div>
                  <div className="v1-group-rows">
                    {bucketBySubgroup(rows, g).map((sub, si) => (
                      <React.Fragment key={sub.name || "_flat"}>
                        {sub.name && (
                          <div className="v1-subgroup-hd">
                            <span></span>
                            <span className="ttl">
                              {sub.name}
                              <span className="n">{sub.rows.length} {sub.rows.length === 1 ? "account" : "accounts"}</span>
                            </span>
                            <span className="bal num">{fmtMoneyA(Math.abs(sub.total))}</span>
                          </div>
                        )}
                        {sub.rows.map(a => {
                          const meta = TYPE_META[a.type];
                          const m = accountMetaForRow(a);
                          const isCcSummary = a.type === "credit_summary";
                          // Credit card aggregate row links to the dedicated Credit Cards page.
                          const RowTag = isCcSummary ? "a" : "div";
                          const rowProps = isCcSummary
                            ? { href: "Credit Cards.html",
                                style: { textDecoration: "none", color: "inherit" } }
                            : {};
                          return (
                            <RowTag
                              {...rowProps}
                              key={a.id}
                              className={"v1-row" + (meta.asset ? "" : " liability") + (isCcSummary ? " linkable" : "")}
                            >
                              <span className="spacer"></span>
                              <InstLogo institution={a.institution} />
                              <div className="name">
                                <span className="n">{a.name}</span>
                                <span className="sub">
                                  <b>{a.institution}</b>
                                  {a.last4 && <> · ····{a.last4}</>}
                                  {" · "}
                                  {fmtRelDate(a.lastActivity)}
                                </span>
                              </div>
                              <div className="meta">
                                <b>{m.primary}</b>
                                {m.secondary && <span>{m.secondary}</span>}
                              </div>
                              <div className="delta-col"><Delta amount={a.delta30} /></div>
                              <div className="bal num">{fmtMoneyA(Math.abs(a.balance))}</div>
                            </RowTag>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {tab === "active" && (
            <div className="hidden-accounts-toggle">
              <button onClick={() => setShowHidden(s => !s)}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M1 6s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z"/><circle cx="6" cy="6" r="1.5"/></svg>
                {showHidden ? "Hide" : "Show"} {closed.length} hidden {closed.length === 1 ? "account" : "accounts"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V1Plus, NWChart, Sparkline, Composition, AccountCard });
