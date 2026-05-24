// credit-cards-app.jsx — main Credit Cards view.
// Hero tiles → master utilization → sort+filter toolbar → card list
// (Active / Closed tabs). Clicking a row expands an inline detail panel
// beneath it (pops out from the row, not a side drawer).

const { useState, useMemo, useEffect } = React;

const { CREDIT_CARDS, ccSummary, utilTone, daysBetween, TODAY,
        TweaksPanel, TweakSection, TweakRadio, TweakToggle, useTweaks } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "regular",
  "privacy": false,
  "activeTab": "active"
}/*EDITMODE-END*/;

const SORT_OPTIONS = [
  { id: "smart",       label: "Recommended" },
  { id: "manual",      label: "Manual (drag to reorder)" },
  { id: "balance",     label: "Balance · high → low" },
  { id: "util",        label: "Utilization · high → low" },
  { id: "dueDate",     label: "Due date · soonest" },
  { id: "cashback",    label: "Cashback YTD" },
  { id: "opened",      label: "Newest first" },
  { id: "name",        label: "Name (A→Z)" },
];

const FILTER_OPTIONS = [
  { id: "all",     label: "All" },
  { id: "balance", label: "Has balance" },
  { id: "paid",    label: "Paid in full" },
  { id: "signup",  label: "Signup bonus" },
  { id: "fee",     label: "Fee due" },
];

// ─── Formatters ────────────────────────────────────────────────────────────
function fmtMoney(n, { decimals = 2, sign = false } = {}) {
  if (n == null || isNaN(n)) return "—";
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  if (sign && !neg && n > 0) return `+$${s}`;
  return (neg ? "-$" : "$") + s;
}
function fmtMoney0(n) { return fmtMoney(n, { decimals: 0 }); }
function fmtPct(n, d = 1) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(d) + "%";
}
function fmtDate(iso, { short = false } = {}) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US",
    short ? { month: "short", day: "numeric" }
          : { month: "short", day: "numeric", year: "numeric" });
}
function relDays(iso) {
  if (!iso) return null;
  const n = daysBetween(TODAY, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0)  return `in ${n} days`;
  return `${-n} days ago`;
}

// Friendly "opened 3 yrs, 2 mo ago" style label
function cardAge(openedISO) {
  if (!openedISO) return "—";
  const opened = new Date(openedISO + "T00:00:00");
  const today  = new Date(TODAY + "T00:00:00");
  let years  = today.getFullYear() - opened.getFullYear();
  let months = today.getMonth()    - opened.getMonth();
  if (today.getDate() < opened.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0 && months <= 0) return "opened this month";
  const parts = [];
  if (years > 0)  parts.push(years + " yr" + (years === 1 ? "" : "s"));
  if (months > 0) parts.push(months + " mo");
  return parts.join(", ") + " old";
}

// ─── Tiny shared bits ──────────────────────────────────────────────────────
function Delta({ amount }) {
  if (amount == null || amount === 0) {
    return <span style={{ color: "var(--text-3)" }} className="num">·</span>;
  }
  const pos = amount > 0;
  // For credit-cards "balance went UP" is actually a negative thing (more debt)
  // but we keep arrow direction tied to sign and let context speak.
  return (
    <span className={"num"} style={{
      color: pos ? "var(--red-text)" : "var(--green-text)",
      fontWeight: 600, fontSize: 12.5,
    }}>
      {pos ? "▲" : "▼"} {fmtMoney(Math.abs(amount), { decimals: 0 })}
    </span>
  );
}

// ─── Hero tiles row ────────────────────────────────────────────────────────
function HeroTiles({ s }) {
  return (
    <div className="cc-tiles">
      <section className="card cc-tile">
        <span className="lbl">Total balance</span>
        <span className="val num">{fmtMoney(s.totalBalance)}</span>
        <span className="sub">
          Across <b className="num">{s.cardCount}</b> active cards
        </span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Utilization</span>
        <span className="val num">{fmtPct(s.util)}</span>
        <span className="sub">
          of <span className="num">{fmtMoney0(s.totalLimit)}</span> limit
        </span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Available</span>
        <span className="val num">{fmtMoney0(s.available)}</span>
        <span className="sub">Headroom to spend</span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Cashback YTD</span>
        <span className="val num">{fmtMoney(s.cashbackYTD)}</span>
        <span className="sub">
          Net of fees <span className={s.netCashback >= 0 ? "pos" : "neg"}>
            {fmtMoney(s.netCashback, { sign: true })}
          </span>
        </span>
      </section>
    </div>
  );
}

// ─── Master utilization bar (with FICO thresholds) ─────────────────────────
function MasterUtil({ s }) {
  const tone = utilTone(s.util);
  const pct  = Math.min(100, s.util);
  // Threshold markers at 10%, 30%, 50% (credit-score breakpoints)
  const thresholds = [
    { v: 10, label: "Ideal" },
    { v: 30, label: "Good" },
    { v: 50, label: "High" },
  ];
  return (
    <section className="card master-util">
      <div className="master-util-hd">
        <span className="ttl">Total utilization</span>
        <span className="util-pct">
          {fmtPct(s.util)}
          <span className="of num">
            {fmtMoney0(s.totalBalance)} / {fmtMoney0(s.totalLimit)}
          </span>
        </span>
      </div>
      <div className="util-bar">
        <div className={"fill " + tone} style={{ width: pct + "%" }} />
        {thresholds.map(th => (
          <React.Fragment key={th.v}>
            <div className="marker" style={{ left: th.v + "%" }} />
          </React.Fragment>
        ))}
      </div>
      <div className="util-markers">
        <span className="threshold"><span className="v">0%</span></span>
        {thresholds.map(th => (
          <span className="threshold" key={th.v}>
            <span className="v">{th.v}%</span>
            <span>{th.label}</span>
          </span>
        ))}
        <span className="threshold"><span className="v">100%</span></span>
      </div>
    </section>
  );
}

// ─── Card row in the list ──────────────────────────────────────────────────
function CardArt({ card, size }) {
  const w = size === "lg" ? 180 : 132;
  const h = size === "lg" ? 114 : 84;
  return (
    <div className="cc-art" style={{
      width: w, height: h,
      ["--art-from"]: card.art.from,
      ["--art-to"]:   card.art.to,
    }}>
      <span className="issuer">{card.issuer}</span>
      {card.last4 && <span className="cc-art-last4 num">•••• {card.last4}</span>}
      <span className="network">{card.network}</span>
    </div>
  );
}

function StateChip({ card }) {
  if (card.state === "signup_bonus") {
    const sb = card.signupBonus;
    const pct = Math.min(100, (sb.spendSoFar / sb.spendRequired) * 100);
    return (
      <span className="cc-state-chip signup">
        Signup · {Math.round(pct)}% to bonus
      </span>
    );
  }
  if (card.state === "fee_due") {
    const days = daysBetween(TODAY, card.annualFeeDueDate);
    return (
      <span className="cc-state-chip fee">
        ${card.annualFee} fee · {days} days
      </span>
    );
  }
  return null;
}

// Inline-editable card name. Pencil icon appears on row hover; clicking it
// (or pressing Enter/F2 on focus) swaps the text for an <input>. Commits on
// blur or Enter, cancels on Escape, prevents the row click+drag from firing.
function EditableCardName({ value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef              = React.useRef(null);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start(e) {
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
  }
  function commit() {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    setEditing(false);
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }
  // Prevent row click + drag while editing
  const stop = (e) => e.stopPropagation();

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="cc-name-edit"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={stop}
        onMouseDown={stop}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
        onBlur={commit}
        aria-label="Card nickname"
        maxLength={48}
      />
    );
  }
  return (
    <>
      <span className="n editable" onClick={start} title="Click to rename">{value}</span>
      <button
        className="cc-rename-btn"
        onClick={start}
        onMouseDown={stop}
        aria-label="Rename card"
        title="Rename"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.5 1.5l2 2-7.5 7.5H3v-2L10.5 1.5z"/>
          <path d="M9 3l2 2"/>
        </svg>
      </button>
    </>
  );
}

function CardRow({ card, displayName, onClick, onGripMouseDown, onRename }) {
  const limit = card.isNoPreset ? card.limit : card.limit; // displayed limit
  const util  = card.limit > 0 ? (card.balance / card.limit) * 100 : 0;
  const tone  = utilTone(util);
  return (
    <div className="cc-row" onClick={onClick}>
      <span
        className="cc-grip"
        onMouseDown={onGripMouseDown}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/>
          <circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/>
          <circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/>
        </svg>
      </span>
      <CardArt card={card} />
      <div className="cc-name-col">
        <div className="top">
          <EditableCardName value={displayName} onCommit={onRename} />
          <StateChip card={card} />
        </div>
        <div className="sub">
          <span className="b">{card.issuer}</span>
          {card.dueDate && (<>
            <span className="dot">·</span>
            <span>Due {fmtDate(card.dueDate, { short: true })}</span>
          </>)}
          {card.balance === 0 && (<>
            <span className="dot">·</span>
            <span>Paid in full</span>
          </>)}
        </div>
      </div>
      <div className="cc-util">
        <div className="meta">
          <span>Util</span>
          <span className={"pct " + tone}>{fmtPct(util, util < 1 ? 1 : 0)}</span>
        </div>
        <div className="bar">
          <div className={"fill " + tone} style={{ width: Math.min(100, util) + "%" }} />
        </div>
        <div className="meta">
          <span>{fmtMoney0(card.balance)} of {card.isNoPreset ? "no preset" : fmtMoney0(card.limit)}</span>
        </div>
      </div>
      <div className="cc-bal">
        <span className={"b" + (card.balance > 0 ? " red" : "")}>
          {card.balance > 0 ? fmtMoney(card.balance) : "$0.00"}
        </span>
        <span className="of">
          {card.statementBalance != null && card.statementBalance !== card.balance
            ? <>Stmt {fmtMoney0(card.statementBalance)}</>
            : <>APR {card.apr}%</>}
        </span>
      </div>
      <div className="cc-chev">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l4 4-4 4"/></svg>
      </div>
    </div>
  );
}

// ─── State card (signup / fee) — used inside inline expand ───────────────────
function StateCard({ card }) {
  if (card.state === "signup_bonus") {
    const sb = card.signupBonus;
    const pct = Math.min(100, (sb.spendSoFar / sb.spendRequired) * 100);
    const remaining = sb.spendRequired - sb.spendSoFar;
    const daysLeft = daysBetween(TODAY, sb.spendDeadline);
    const valueDollars = (sb.amount * sb.valuationCents) / 100;
    return (
      <section className="drawer-state-card signup">
        <div className="state-hd">
          <span className="l">Signup bonus in progress</span>
          <span className="r">Deadline {fmtDate(sb.spendDeadline, { short: true })} · {daysLeft} days</span>
        </div>
        <div className="progress-row signup">
          <div className="nums">
            <span className="a num">{fmtMoney0(sb.spendSoFar)}</span>
            <span className="b num">of {fmtMoney0(sb.spendRequired)} required spend</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: pct + "%" }} />
          </div>
        </div>
        <div className="state-line-rows">
          <div className="state-line-row">
            <span className="lbl">Bonus</span>
            <span className="v num">{sb.amount.toLocaleString()} {sb.type}</span>
          </div>
          <div className="state-line-row">
            <span className="lbl">Estimated value</span>
            <span className="v num">{fmtMoney(valueDollars)} ({sb.valuationCents}¢/pt)</span>
          </div>
          <div className="state-line-row">
            <span className="lbl">Remaining to spend</span>
            <span className="v num">{fmtMoney0(remaining)} in {daysLeft} days</span>
          </div>
          <div className="state-line-row">
            <span className="lbl">Daily pace needed</span>
            <span className="v num">{fmtMoney(remaining / Math.max(1, daysLeft), { decimals: 0 })}/day</span>
          </div>
        </div>
      </section>
    );
  }
  if (card.state === "fee_due") {
    const daysLeft = daysBetween(TODAY, card.annualFeeDueDate);
    const cashbackVsFee = (card.cashbackYTD || 0) - card.annualFee;
    return (
      <section className="drawer-state-card fee">
        <div className="state-hd">
          <span className="l">Annual fee posting soon</span>
          <span className="r">{fmtDate(card.annualFeeDueDate, { short: true })} · {daysLeft} days</span>
        </div>
        <div className="progress-row fee">
          <div className="nums">
            <span className="a num">{fmtMoney(card.annualFee)}</span>
            <span className="b num">annual fee due</span>
          </div>
        </div>
        <div className="state-line-rows">
          <div className="state-line-row">
            <span className="lbl">Cashback earned YTD</span>
            <span className="v num">{fmtMoney(card.cashbackYTD)}</span>
          </div>
          <div className="state-line-row">
            <span className="lbl">Net after fee</span>
            <span className="v num" style={{ color: cashbackVsFee >= 0 ? "var(--green-text)" : "var(--red-text)" }}>
              {fmtMoney(cashbackVsFee, { sign: true })}
            </span>
          </div>
          <div className="state-line-row">
            <span className="lbl">Card opened</span>
            <span className="v num">{fmtDate(card.openedDate)}</span>
          </div>
        </div>
      </section>
    );
  }
  return null;
}

// Inline details panel — rendered inside .cc-expand below the clicked row.
// Reuses the .drawer-stat / .drawer-section / .benefits-list visual primitives.
function InlineDetails({ card }) {
  const util = card.limit > 0 ? (card.balance / card.limit) * 100 : 0;
  return (
    <div className="cc-expand-content">
      {(card.state === "signup_bonus" || card.state === "fee_due") && (
        <StateCard card={card} />
      )}

      <div className="drawer-section">
        <div className="h">Balance · this cycle</div>
        <div className="cc-inline-stats">
          <div className={"drawer-stat" + (card.balance > 0 ? " red" : "")}>
            <span className="lbl">Current balance</span>
            <span className="val num">{fmtMoney(card.balance)}</span>
            <span className="sub">{fmtPct(util, util < 1 ? 1 : 0)} of {card.isNoPreset ? "no preset" : fmtMoney0(card.limit)}</span>
          </div>
          <div className="drawer-stat">
            <span className="lbl">Statement balance</span>
            <span className="val num">{fmtMoney(card.statementBalance || 0)}</span>
            <span className="sub">{card.closingDate ? `Closes ${fmtDate(card.closingDate, { short: true })}` : "—"}</span>
          </div>
          <div className="drawer-stat">
            <span className="lbl">Min payment</span>
            <span className="val num">{fmtMoney(card.minPayment || 0)}</span>
            <span className="sub">{card.dueDate ? `Due ${fmtDate(card.dueDate, { short: true })} · ${relDays(card.dueDate)}` : "—"}</span>
          </div>
          <div className="drawer-stat">
            <span className="lbl">APR</span>
            <span className="val num">{card.apr}%</span>
            <span className="sub">Variable purchase APR</span>
          </div>
          <div className="drawer-stat">
            <span className="lbl">Opened</span>
            <span className="val num" style={{ fontSize: 15 }}>{fmtDate(card.openedDate, { short: true })}, {new Date(card.openedDate + "T00:00:00").getFullYear()}</span>
            <span className="sub">{cardAge(card.openedDate)}</span>
          </div>
        </div>
      </div>

      <div className="cc-inline-bottom">
        {card.benefits?.length > 0 && (
          <div className="drawer-section">
            <div className="h">Benefits</div>
            <div className="benefits-list">
              {card.benefits.map((b, i) => (
                <div className="benefit-row" key={i}>
                  <span className="dot" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="drawer-section">
          <div className="h">Rewards & fees</div>
          <div className="drawer-grid">
            <div className="drawer-stat green">
              <span className="lbl">Cashback YTD</span>
              <span className="val num">{fmtMoney(card.cashbackYTD || 0)}</span>
              <span className="sub">Net of fees</span>
            </div>
            <div className="drawer-stat">
              <span className="lbl">Annual fee</span>
              <span className="val num">{card.annualFee > 0 ? fmtMoney(card.annualFee) : "$0"}</span>
              <span className="sub">{card.annualFeeDueDate ? `Next ${fmtDate(card.annualFeeDueDate, { short: true })}` : "No fee"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState("smart");
  const [filterBy, setFilterBy] = useState("all");

  // User-set nicknames, persisted across reloads. Keyed by card id.
  // Overrides the data file's default `nickname` (or `name` if no default).
  const [nicknames, setNicknames] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cc:nicknames") || "{}"); }
    catch { return {}; }
  });
  React.useEffect(() => {
    try { localStorage.setItem("cc:nicknames", JSON.stringify(nicknames)); }
    catch (_) {}
  }, [nicknames]);
  function setCardNickname(cardId, value) {
    setNicknames(prev => {
      const next = { ...prev };
      const trimmed = (value || "").trim();
      if (!trimmed) delete next[cardId];
      else next[cardId] = trimmed;
      return next;
    });
  }
  const displayNameOf = (card) =>
    nicknames[card.id] || card.nickname || card.name;

  // Drag-and-drop reorder state
  const [manualOrder, setManualOrder] = useState(null);   // array of card ids, or null = derived from current sort
  const [draggingId, setDraggingId] = useState(null);     // id of the row being dragged
  const [dropTarget, setDropTarget] = useState(null);     // { id, edge: 'before'|'after' }
  const dragReadyRef = React.useRef(false);                // grip held → allow drag on next event
  // Keep the most-recently-selected card mounted briefly after close so the
  // collapse animation has real content to shrink with (otherwise the panel
  // unmounts instantly and the transition looks abrupt).
  const [shownCard, setShownCard] = useState(null);
  const shownTimerRef = React.useRef(null);

  useEffect(() => {
    if (selected) {
      if (shownTimerRef.current) clearTimeout(shownTimerRef.current);
      setShownCard(selected);
    } else if (shownCard) {
      // Hold previous content through the closing transition (~440ms total)
      shownTimerRef.current = setTimeout(() => setShownCard(null), 500);
    }
    return () => { if (shownTimerRef.current) clearTimeout(shownTimerRef.current); };
  }, [selected]);

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.setAttribute("data-privacy", t.privacy ? "on" : "off");
  }, [t.theme, t.density, t.privacy]);

  // ESC closes the inline expansion
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && selected) setSelected(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const active = CREDIT_CARDS.filter(c => !c.closed);
  const closed = CREDIT_CARDS.filter(c => c.closed);
  const summary = useMemo(() => ccSummary(CREDIT_CARDS), []);

  // Order: states-needing-attention first, then by balance desc, then by limit desc
  const sortedActive = useMemo(() => {
    const stateRank = { signup_bonus: 0, fee_due: 1, steady: 2 };
    // First: apply filter
    const filtered = active.filter(c => {
      switch (filterBy) {
        case "balance": return c.balance > 0;
        case "paid":    return c.balance === 0;
        case "signup":  return c.state === "signup_bonus";
        case "fee":     return c.state === "fee_due";
        default:        return true;
      }
    });
    // Then: sort
    const sorted = [...filtered];
    const utilOf = (c) => (c.limit > 0 ? (c.balance / c.limit) * 100 : 0);
    const dueOf  = (c) => c.dueDate ? new Date(c.dueDate).getTime() : Infinity;
    switch (sortBy) {
      case "manual":
        if (manualOrder) {
          // Apply user-defined order; any new cards not in the list go to the end
          const idx = (id) => {
            const p = manualOrder.indexOf(id);
            return p === -1 ? Number.MAX_SAFE_INTEGER : p;
          };
          sorted.sort((a, b) => idx(a.id) - idx(b.id));
        }
        break;
      case "balance":
        sorted.sort((a, b) => b.balance - a.balance); break;
      case "util":
        sorted.sort((a, b) => utilOf(b) - utilOf(a)); break;
      case "dueDate":
        sorted.sort((a, b) => dueOf(a) - dueOf(b)); break;
      case "cashback":
        sorted.sort((a, b) => (b.cashbackYTD || 0) - (a.cashbackYTD || 0)); break;
      case "opened":
        sorted.sort((a, b) => new Date(b.openedDate) - new Date(a.openedDate)); break;
      case "name":
        sorted.sort((a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name)); break;
      case "smart":
      default:
        sorted.sort((a, b) => {
          const r = (stateRank[a.state] ?? 9) - (stateRank[b.state] ?? 9);
          if (r !== 0) return r;
          if (b.balance !== a.balance) return b.balance - a.balance;
          return b.limit - a.limit;
        });
        break;
    }
    return sorted;
  }, [active, sortBy, filterBy, manualOrder]);

  // Counts for filter chips (always reflect the unfiltered active list)
  const filterCounts = useMemo(() => ({
    all:     active.length,
    balance: active.filter(c => c.balance > 0).length,
    paid:    active.filter(c => c.balance === 0).length,
    signup:  active.filter(c => c.state === "signup_bonus").length,
    fee:     active.filter(c => c.state === "fee_due").length,
  }), [active]);

  // ─── Drag-and-drop handlers ──────────────────────────────────────
  function onGripMouseDown() {
    dragReadyRef.current = true;
  }
  function onRowDragStart(e, id) {
    if (!dragReadyRef.current) {
      // Drag didn't originate from the grip — cancel
      e.preventDefault();
      return;
    }
    dragReadyRef.current = false;
    setDraggingId(id);
    setSelected(null); // collapse any open detail panel while dragging
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch (_) {}
  }
  function onRowDragOver(e, id) {
    if (!draggingId || id === draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const edge = (e.clientY - rect.top) < rect.height / 2 ? "before" : "after";
    setDropTarget((cur) => (cur && cur.id === id && cur.edge === edge) ? cur : { id, edge });
  }
  function onRowDrop(e, targetId) {
    e.preventDefault();
    const sourceId = draggingId || e.dataTransfer.getData("text/plain");
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!sourceId || sourceId === targetId || !target) return;

    const currentIds = sortedActive.map(c => c.id);
    const sourceIdx = currentIds.indexOf(sourceId);
    if (sourceIdx === -1) return;
    let targetIdx = currentIds.indexOf(target.id);
    if (targetIdx === -1) return;

    const next = [...currentIds];
    next.splice(sourceIdx, 1);
    // Adjust target index after removing the source from before it
    if (sourceIdx < targetIdx) targetIdx -= 1;
    const insertAt = target.edge === "before" ? targetIdx : targetIdx + 1;
    next.splice(insertAt, 0, sourceId);

    // Persist this manual order across ALL active cards, not just filtered ones,
    // so filters don't lose information about cards we didn't move.
    const allActiveIds = active.map(c => c.id);
    const visibleSet = new Set(currentIds);
    const merged = [];
    let visibleCursor = 0;
    const baseOrder = manualOrder ?? allActiveIds;
    for (const id of baseOrder) {
      if (visibleSet.has(id)) {
        // Pull from the newly-reordered visible list, in order
        merged.push(next[visibleCursor++]);
      } else {
        merged.push(id);
      }
    }
    // Append any active card we haven't seen yet (e.g. newly added)
    for (const id of allActiveIds) if (!merged.includes(id)) merged.push(id);

    setManualOrder(merged);
    setSortBy("manual");
  }
  function onRowDragEnd() {
    dragReadyRef.current = false;
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <>
      <div className="page">
        <header className="page-hd">
          <div>
            <div className="crumbs">
              <span>Vault</span>
              <span style={{ opacity: .5 }}>/</span>
              <span className="here">Credit cards</span>
            </div>
            <h1 className="page-title">Credit cards</h1>
          </div>
          <div className="page-actions">
            <button className="pg-btn">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 2v10M2 7h10"/></svg>
              Add card
            </button>
          </div>
        </header>

        <nav className="tabs" role="tablist">
          <button
            role="tab"
            className={"tab" + (t.activeTab === "active" ? " active" : "")}
            onClick={() => setTweak("activeTab", "active")}
          >
            Active <span className="count num">{active.length}</span>
          </button>
          <button
            role="tab"
            className={"tab" + (t.activeTab === "closed" ? " active" : "")}
            onClick={() => setTweak("activeTab", "closed")}
          >
            Closed <span className="count num">{closed.length}</span>
          </button>
        </nav>

        {t.activeTab === "active" && (
          <>
            <HeroTiles s={summary} />
            <MasterUtil s={summary} />
            <div className="cc-toolbar">
              <div className="cc-filter-chips" role="group" aria-label="Filter cards">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    className={"cc-chip" + (filterBy === opt.id ? " active" : "")}
                    onClick={() => { setFilterBy(opt.id); setSelected(null); }}
                    disabled={filterCounts[opt.id] === 0 && opt.id !== "all"}
                    style={filterCounts[opt.id] === 0 && opt.id !== "all" ? { opacity: .35, cursor: "not-allowed" } : null}
                  >
                    {opt.label}
                    <span className="count num">{filterCounts[opt.id]}</span>
                  </button>
                ))}
              </div>
              <label className="cc-sort">
                <span>Sort by</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {sortedActive.length === 0 ? (
              <div className="card cc-no-results">No cards match this filter.</div>
            ) : (
            <div className="cc-list">
              {sortedActive.map(c => {
                const isOpen = selected?.id === c.id;
                const isDragging = draggingId === c.id;
                const dropEdge = dropTarget?.id === c.id ? dropTarget.edge : null;
                const showContent = isOpen || shownCard?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={
                      "cc-row-wrap" +
                      (isOpen ? " open" : "") +
                      (isDragging ? " dragging" : "") +
                      (dropEdge === "before" ? " drop-before" : "") +
                      (dropEdge === "after" ? " drop-after" : "")
                    }
                    draggable={true}
                    onDragStart={(e) => onRowDragStart(e, c.id)}
                    onDragOver={(e) => onRowDragOver(e, c.id)}
                    onDrop={(e) => onRowDrop(e, c.id)}
                    onDragEnd={onRowDragEnd}
                  >
                    <CardRow
                      card={c}
                      displayName={displayNameOf(c)}
                      onClick={() => setSelected(isOpen ? null : c)}
                      onGripMouseDown={onGripMouseDown}
                      onRename={(name) => setCardNickname(c.id, name)}
                    />
                    <div className="cc-expand" aria-hidden={!isOpen}>
                      <div className="cc-expand-inner">
                        {showContent && <InlineDetails card={c} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </>
        )}

        {t.activeTab === "closed" && (
          closed.length === 0 ? (
            <div className="card empty-state">No closed cards.</div>
          ) : (
            <div className="cc-list">
              {closed.map(c => (
                <div key={c.id} className="cc-row-wrap" style={{ opacity: .75 }}>
                  <div className="cc-row">
                  <CardArt card={c} />
                  <div className="cc-name-col">
                    <div className="top">
                      <span className="n">{c.name}</span>
                      <span className="pill" style={{ background: "var(--surface-elev)", color: "var(--text-3)" }}>
                        Closed
                      </span>
                    </div>
                    <div className="sub">
                      <span className="b">{c.issuer}</span>
                      <span className="dot">·</span>
                      <span>Closed {fmtDate(c.closedDate, { short: true })}</span>
                    </div>
                  </div>
                  <div className="cc-util" style={{ color: "var(--text-3)" }}>
                    <div className="meta">
                      <span>Open</span>
                      <span className="pct">
                        {((daysBetween(c.openedDate, c.closedDate)) / 365.25).toFixed(1)} yrs
                      </span>
                    </div>
                  </div>
                  <div className="cc-bal" style={{ color: "var(--text-3)" }}>
                    <span className="b" style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>—</span>
                  </div>
                  <div className="cc-chev" />
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio  label="Theme"   value={t.theme}   options={["light", "dark"]}
                     onChange={(v) => setTweak("theme", v)} />
        <TweakRadio  label="Density" value={t.density} options={["compact", "regular", "comfy"]}
                     onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Privacy" />
        <TweakToggle label="Hide balances" value={t.privacy}
                     onChange={(v) => setTweak("privacy", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
