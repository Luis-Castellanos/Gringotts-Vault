'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Data shape ────────────────────────────────────────────────────────────
// Phase B (in progress): credit_limit + apr are now in the schema and
// editable. Lifecycle fields below the divider remain stubs until further
// migrations land.
export type SignupBonus = {
  amount: number;
  type: string;
  valuationCents: number;
  spendRequired: number;
  spendDeadline: string;
  spendSoFar: number;
};

export type CreditCardData = {
  id: string;
  name: string;
  displayName: string;
  institution: string;
  last4: string;
  balance: number;
  openedDate: string | null;
  closedDate: string | null;
  isActive: boolean;
  artUrl: string | null;
  limit: number | null;
  apr: number | null;
  earliestTxnDate: string | null;
  annualFee: number | null;
  annualFeeDueDate: string | null;
  cashbackYTD: number | null;
  signupBonus: SignupBonus | null;
  benefits: string[] | null;
  isNoPreset: boolean;
  network: string | null;
  state: 'steady' | 'signup_bonus' | 'fee_due';
  lifetimeSpend: number | null; // total charged over the card's life (for closed cards)
};

// ─── Constants ─────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

const SORT_OPTIONS = [
  { id: 'manual', label: 'Manual order' },
  { id: 'balance', label: 'Balance · high → low' },
  { id: 'util', label: 'Utilization · high → low' },
  { id: 'cashback', label: 'Cashback YTD · high → low' },
  { id: 'opened', label: 'Newest first' },
  { id: 'name', label: 'Name (A → Z)' },
] as const;

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'balance', label: 'Has balance' },
  { id: 'paid', label: 'Paid off' },
] as const;

type SortId = (typeof SORT_OPTIONS)[number]['id'];
type FilterId = (typeof FILTER_OPTIONS)[number]['id'];

// ─── Formatters ────────────────────────────────────────────────────────────
function fmtMoney(
  n: number | null | undefined,
  { decimals = 2, sign = false }: { decimals?: number; sign?: boolean } = {},
): string {
  if (n == null || Number.isNaN(n)) return '—';
  const neg = n < 0;
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (sign && !neg && n > 0) return `+$${s}`;
  return (neg ? '-$' : '$') + s;
}
function fmtMoney0(n: number | null | undefined): string {
  return fmtMoney(n, { decimals: 0 });
}
function fmtPct(n: number | null | undefined, d = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(d) + '%';
}
function fmtDate(iso: string | null, { short = false }: { short?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US',
    short ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
function cardAge(openedISO: string | null): string {
  if (!openedISO) return '—';
  const opened = new Date(openedISO + 'T00:00:00');
  const today = new Date(TODAY + 'T00:00:00');
  let years = today.getFullYear() - opened.getFullYear();
  let months = today.getMonth() - opened.getMonth();
  if (today.getDate() < opened.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0 && months <= 0) return 'opened this month';
  const parts: string[] = [];
  if (years > 0) parts.push(years + ' yr' + (years === 1 ? '' : 's'));
  if (months > 0) parts.push(months + ' mo');
  return parts.join(', ') + ' old';
}

// ─── Helpers ───────────────────────────────────────────────────────────────
// Continuous green → amber → red color for a utilization %, so the bar's color
// reflects exactly how high the utilization is (capped at 100%).
function utilColor(pct: number): string {
  const p = Math.max(0, Math.min(pct, 100)) / 100;
  const hue = 130 - 130 * p; // 130° (green) at 0% → 0° (red) at 100%
  return `hsl(${Math.round(hue)}, 72%, 45%)`;
}

type Summary = {
  cardCount: number;
  totalLimit: number | null;
  totalBalance: number;
  util: number | null;
  cashbackYTD: number | null;
  annualFees: number | null;
  netCashback: number | null;
  available: number | null;
  interestMonthly: number | null; // est. monthly interest across cards with balance + APR
  overThirty: number; // count of active cards over 30% utilization
};

// Estimated monthly interest on a revolving balance: balance × (APR/12).
function monthlyInterest(card: CreditCardData): number | null {
  if (card.apr == null || card.balance <= 0) return null;
  return (card.balance * (card.apr / 100)) / 12;
}
function cardUtil(card: CreditCardData): number | null {
  return card.limit != null && card.limit > 0 ? (card.balance / card.limit) * 100 : null;
}

function ccSummary(cards: CreditCardData[]): Summary {
  const active = cards.filter((c) => c.isActive);
  const limits = active.map((c) => c.limit).filter((x): x is number => x != null);
  const cashbacks = active.map((c) => c.cashbackYTD).filter((x): x is number => x != null);
  const fees = active.map((c) => c.annualFee).filter((x): x is number => x != null);
  const totalBalance = active.reduce((s, c) => s + c.balance, 0);
  const totalLimit = limits.length === active.length && active.length > 0
    ? limits.reduce((s, n) => s + n, 0)
    : null;
  const util = totalLimit != null && totalLimit > 0 ? (totalBalance / totalLimit) * 100 : null;
  const cashbackYTD = cashbacks.length > 0 ? cashbacks.reduce((s, n) => s + n, 0) : null;
  const annualFees = fees.length > 0 ? fees.reduce((s, n) => s + n, 0) : null;
  const netCashback = cashbackYTD != null && annualFees != null ? cashbackYTD - annualFees : null;
  const available = totalLimit != null ? totalLimit - totalBalance : null;
  const interests = active.map(monthlyInterest).filter((x): x is number => x != null);
  const interestMonthly = interests.length > 0 ? interests.reduce((s, n) => s + n, 0) : null;
  const overThirty = active.filter((c) => { const u = cardUtil(c); return u != null && u > 30; }).length;
  return {
    cardCount: active.length,
    totalLimit, totalBalance, util, cashbackYTD, annualFees, netCashback, available,
    interestMonthly, overThirty,
  };
}

function gradientFor(seed: string): { from: string; to: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return {
    from: `hsl(${hue}, 45%, 35%)`,
    to: `hsl(${(hue + 28) % 360}, 50%, 18%)`,
  };
}

// PATCH helper — returns { ok: true } or { ok: false, error: string }
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

// ─── Sub-components ────────────────────────────────────────────────────────
function CardArt({ card }: { card: CreditCardData }) {
  if (card.artUrl) {
    return (
      <div className="cc-art has-image" aria-label={card.displayName}>
        <Image
          src={card.artUrl}
          alt=""
          width={296}
          height={188}
          quality={95}
          priority
          unoptimized={false}
          sizes="148px"
        />
      </div>
    );
  }
  const grad = gradientFor(card.id);
  return (
    <div
      className="cc-art"
      style={{
        ['--art-from' as string]: grad.from,
        ['--art-to' as string]: grad.to,
      } as React.CSSProperties}
    >
      <span className="issuer">{card.institution || card.name}</span>
      {card.last4 && <span className="cc-art-last4 num">•••• {card.last4}</span>}
      {card.network && <span className="network">{card.network}</span>}
    </div>
  );
}

function StateChip({ card }: { card: CreditCardData }) {
  if (card.state === 'signup_bonus' && card.signupBonus) {
    const sb = card.signupBonus;
    const pct = Math.min(100, (sb.spendSoFar / sb.spendRequired) * 100);
    return (
      <span className="cc-state-chip signup">
        Signup · {Math.round(pct)}% to bonus
      </span>
    );
  }
  if (card.state === 'fee_due' && card.annualFeeDueDate && card.annualFee != null) {
    const days = daysBetween(TODAY, card.annualFeeDueDate);
    return (
      <span className="cc-state-chip fee">
        ${card.annualFee} fee · {days} days
      </span>
    );
  }
  return null;
}

function EditableCardName({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function start(e: React.MouseEvent) {
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
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
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
        type="button"
        className="cc-rename-btn"
        onClick={start}
        onMouseDown={stop}
        aria-label="Rename card"
        title="Rename"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.5 1.5l2 2-7.5 7.5H3v-2L10.5 1.5z" />
          <path d="M9 3l2 2" />
        </svg>
      </button>
    </>
  );
}

// EditableStat — click-to-edit pattern for one stat tile in the inline panel.
// Supports currency, percent, and date inputs. Validation is server-side;
// any returned error is shown inline and the input stays open.
type EditableStatProps = {
  label: string;
  display: string;
  isPlaceholder?: boolean;
  initialValue: string;
  inputType: 'currency' | 'percent' | 'date' | 'text';
  sub?: string;
  max?: string;
  placeholder?: string;
  onSave: (raw: string) => Promise<PatchResult>;
};

function EditableStat({
  label,
  display,
  isPlaceholder,
  initialValue,
  inputType,
  sub,
  max,
  placeholder,
  onSave,
}: EditableStatProps) {
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

  function start(e: React.MouseEvent) {
    e.stopPropagation();
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
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      // Stay in edit mode so the user can correct.
      return;
    }
    setError(null);
    setEditing(false);
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (editing) {
    let inputProps: React.InputHTMLAttributes<HTMLInputElement>;
    if (inputType === 'date') {
      inputProps = { type: 'date', max };
    } else if (inputType === 'currency') {
      inputProps = { type: 'text', inputMode: 'decimal', placeholder: placeholder ?? '0.00' };
    } else if (inputType === 'percent') {
      inputProps = { type: 'text', inputMode: 'decimal', placeholder: placeholder ?? '0.0' };
    } else {
      inputProps = { type: 'text', placeholder };
    }
    return (
      <div className="drawer-stat is-editable" onClick={stop}>
        <span className="lbl">{label}</span>
        <input
          ref={inputRef}
          className="edit-input"
          value={draft}
          disabled={saving}
          {...inputProps}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') cancel();
          }}
          onBlur={() => {
            // Slight delay so an Escape keydown can cancel before blur commits.
            setTimeout(() => {
              if (editing) commit();
            }, 50);
          }}
        />
        {error && <div className="edit-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="drawer-stat">
      <span className="lbl">{label}</span>
      <span className={'val num' + (isPlaceholder ? ' placeholder' : '')}>{display}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function CardRow({
  card,
  displayName,
  onClick,
  onRename,
}: {
  card: CreditCardData;
  displayName: string;
  onClick: () => void;
  onRename: (next: string) => void;
}) {
  const hasLimit = card.limit != null && card.limit > 0;
  const util = hasLimit ? (card.balance / (card.limit as number)) * 100 : null;
  return (
    <div className="cc-row" onClick={onClick}>
      <CardArt card={card} />
      <div className="cc-name-col">
        <div className="top">
          <EditableCardName value={displayName} onCommit={onRename} />
          <StateChip card={card} />
          {card.apr != null && <span className="cc-apr">APR {card.apr}%</span>}
        </div>
        <div className="sub">
          {card.institution && <span className="b">{card.institution}</span>}
          {card.balance === 0 && (
            <>
              <span className="dot">·</span>
              <span>Paid in full</span>
            </>
          )}
        </div>
      </div>
      <div className="cc-util">
        {hasLimit && util != null ? (
          <>
            <div className="meta">
              <span>Util</span>
              <span className="pct" style={{ color: utilColor(util) }}>{fmtPct(util, util < 1 ? 1 : 0)}</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: Math.min(100, util) + '%', background: utilColor(util) }} />
            </div>
            <div className="meta">
              <span>
                {fmtMoney0(card.balance)} of {card.isNoPreset ? 'no preset' : fmtMoney0(card.limit)}
              </span>
            </div>
          </>
        ) : (
          <span className="placeholder">No credit limit on file</span>
        )}
      </div>
      <div className="cc-bal">
        <span className={'b' + (card.balance > 0 ? ' red' : '')}>
          {card.balance > 0 ? fmtMoney(card.balance) : '$0.00'}
        </span>
        <span className="of">
          {monthlyInterest(card) != null
            ? <>~{fmtMoney(monthlyInterest(card))}/mo interest</>
            : <>—</>}
        </span>
      </div>
      <div className="cc-chev">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 3l4 4-4 4" />
        </svg>
      </div>
    </div>
  );
}

function StateCard({ card }: { card: CreditCardData }) {
  if (card.state === 'signup_bonus' && card.signupBonus) {
    const sb = card.signupBonus;
    const pct = Math.min(100, (sb.spendSoFar / sb.spendRequired) * 100);
    const remaining = sb.spendRequired - sb.spendSoFar;
    const daysLeft = daysBetween(TODAY, sb.spendDeadline);
    const valueDollars = (sb.amount * sb.valuationCents) / 100;
    return (
      <section className="drawer-state-card signup">
        <div className="state-hd">
          <span className="l">Signup bonus in progress</span>
          <span className="r">
            Deadline {fmtDate(sb.spendDeadline, { short: true })} · {daysLeft} days
          </span>
        </div>
        <div className="progress-row signup">
          <div className="nums">
            <span className="a num">{fmtMoney0(sb.spendSoFar)}</span>
            <span className="b num">of {fmtMoney0(sb.spendRequired)} required spend</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: pct + '%' }} />
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
  if (card.state === 'fee_due' && card.annualFeeDueDate && card.annualFee != null) {
    const daysLeft = daysBetween(TODAY, card.annualFeeDueDate);
    const cashbackVsFee = (card.cashbackYTD ?? 0) - card.annualFee;
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
            <span
              className="v num"
              style={{ color: cashbackVsFee >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}
            >
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

function PayoffCalc({ balance, apr }: { balance: number; apr: number }) {
  const [payment, setPayment] = useState(() => Math.max(25, Math.round((balance * 0.03) / 5) * 5));
  const r = apr / 100 / 12;
  const monthInterest = balance * r;
  const covers = payment > monthInterest;
  let months: number | null = null;
  let totalInterest: number | null = null;
  if (covers) {
    const n = -Math.log(1 - (balance * r) / payment) / Math.log(1 + r);
    months = Math.ceil(n);
    totalInterest = payment * months - balance;
  }
  return (
    <div className="drawer-section">
      <div className="h">Payoff calculator</div>
      <div className="cc-payoff" onClick={(e) => e.stopPropagation()}>
        <label className="cc-payoff-input">
          <span>Monthly payment</span>
          <div className="cc-payoff-field">
            <span className="pre">$</span>
            <input
              type="number"
              min={0}
              step={10}
              value={payment}
              onChange={(e) => setPayment(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </label>
        <div className="cc-payoff-result">
          {covers ? (
            <>
              <div className="big"><strong className="num">{months}</strong> month{months === 1 ? '' : 's'} to pay off</div>
              <div className="sub">≈ <span className="num">{fmtMoney(totalInterest)}</span> total interest at {apr}% APR</div>
            </>
          ) : (
            <div className="warn">
              At {fmtMoney0(payment)}/mo you won&rsquo;t cover the ~{fmtMoney(monthInterest)}/mo interest — the balance won&rsquo;t go down.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BenefitsEditor({ card, onUpdated }: { card: CreditCardData; onUpdated: () => void }) {
  const [items, setItems] = useState<string[]>(card.benefits ?? []);
  const [draft, setDraft] = useState('');
  const persist = async (next: string[]) => {
    setItems(next);
    const r = await patchAccount(card.id, { benefits: next });
    if (r.ok) onUpdated();
  };
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    persist([...items, v]);
    setDraft('');
  };
  return (
    <div className="cc-benefits" onClick={(e) => e.stopPropagation()}>
      {items.map((b, i) => (
        <div key={i} className="cc-benefit-row">
          <span className="dot" />
          <span className="t">{b}</span>
          <button type="button" className="x" aria-label="Remove benefit" onClick={() => persist(items.filter((_, idx) => idx !== i))}>×</button>
        </div>
      ))}
      <div className="cc-benefit-add">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="Add a benefit (e.g. $300 travel credit)"
          maxLength={120}
        />
        <button type="button" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </div>
  );
}

function SignupBonusEditor({ card, onUpdated }: { card: CreditCardData; onUpdated: () => void }) {
  const sb = card.signupBonus;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(sb?.amount ?? ''));
  const [type, setType] = useState(sb?.type ?? 'points');
  const [valuation, setValuation] = useState(String(sb?.valuationCents ?? ''));
  const [spendReq, setSpendReq] = useState(String(sb?.spendRequired ?? ''));
  const [deadline, setDeadline] = useState(sb?.spendDeadline ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const a = Number(amount);
    const sr = Number(spendReq);
    if (!a || !sr || !deadline) { setError('Amount, required spend and deadline are all needed.'); return; }
    setSaving(true);
    setError(null);
    const r = await patchAccount(card.id, {
      signupBonus: {
        amount: a,
        type: type.trim() || 'points',
        valuationCents: Number(valuation) || 0,
        spendRequired: sr,
        spendDeadline: deadline,
      },
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    setEditing(false);
    onUpdated();
  }
  async function clear() {
    setSaving(true);
    await patchAccount(card.id, { signupBonus: null });
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  if (!editing) {
    return sb ? (
      <div className="cc-sb-summary" onClick={(e) => e.stopPropagation()}>
        <span className="t num">
          {sb.amount.toLocaleString()} {sb.type} · {fmtMoney0(sb.spendRequired)} by {fmtDate(sb.spendDeadline, { short: true })}
        </span>
        <div className="acts">
          <button type="button" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="danger" onClick={clear} disabled={saving}>Remove</button>
        </div>
      </div>
    ) : (
      <button type="button" className="cc-add-btn" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
        + Add signup bonus
      </button>
    );
  }
  return (
    <div className="cc-sb-form" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <label>Bonus amount<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="60000" /></label>
        <label>Unit<input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="points" /></label>
        <label>Value (¢/unit)<input type="number" step="0.1" value={valuation} onChange={(e) => setValuation(e.target.value)} placeholder="1.5" /></label>
      </div>
      <div className="row">
        <label>Required spend ($)<input type="number" value={spendReq} onChange={(e) => setSpendReq(e.target.value)} placeholder="4000" /></label>
        <label>Spend by<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      </div>
      {error && <div className="err">{error}</div>}
      <div className="acts">
        {sb && <button type="button" className="danger" onClick={clear} disabled={saving}>Remove</button>}
        <button type="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save bonus'}</button>
      </div>
    </div>
  );
}

function InlineDetails({
  card,
  onUpdated,
}: {
  card: CreditCardData;
  onUpdated: () => void;
}) {
  const hasLimit = card.limit != null && card.limit > 0;
  const util = hasLimit ? (card.balance / (card.limit as number)) * 100 : null;

  return (
    <div className="cc-expand-content">
      {(card.state === 'signup_bonus' || card.state === 'fee_due') && <StateCard card={card} />}

      <Link href={`/accounts/${card.id}`} className="cc-view-txns" onClick={(e) => e.stopPropagation()}>
        View transactions →
      </Link>

      <div className="drawer-section">
        <div className="h">Card info</div>
        <div className="drawer-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <EditableStat
            label="Card name"
            display={card.name}
            initialValue={card.name}
            inputType="text"
            placeholder="e.g. Chase Sapphire Reserve"
            onSave={async (raw) => {
              const trimmed = raw.trim();
              if (!trimmed) return { ok: false, error: 'Name cannot be empty.' };
              const r = await patchAccount(card.id, { name: trimmed });
              if (r.ok) onUpdated();
              return r;
            }}
          />
          <EditableStat
            label="Institution"
            display={card.institution || 'Click to set'}
            isPlaceholder={!card.institution}
            initialValue={card.institution}
            inputType="text"
            placeholder="e.g. Chase"
            onSave={async (raw) => {
              const r = await patchAccount(card.id, { institution: raw.trim() || null });
              if (r.ok) onUpdated();
              return r;
            }}
          />
          <EditableStat
            label="Last 4"
            display={card.last4 || 'Click to set'}
            isPlaceholder={!card.last4}
            initialValue={card.last4}
            inputType="text"
            placeholder="1234"
            onSave={async (raw) => {
              const r = await patchAccount(card.id, { accountNumber: raw.trim() || null });
              if (r.ok) onUpdated();
              return r;
            }}
          />
        </div>
      </div>

      <div className="drawer-section">
        <div className="h">Balance &amp; limit</div>
        <div className="cc-inline-stats">
          <div className={'drawer-stat' + (card.balance > 0 ? ' red' : '')}>
            <span className="lbl">Current balance</span>
            <span className="val num">{fmtMoney(card.balance)}</span>
            <span className="sub">
              {util != null
                ? `${fmtPct(util, util < 1 ? 1 : 0)} of ${card.isNoPreset ? 'no preset' : fmtMoney0(card.limit)}`
                : 'Set a limit below'}
            </span>
          </div>

          <EditableStat
            label="Credit limit"
            display={card.limit != null ? fmtMoney0(card.limit) : 'Click to set'}
            isPlaceholder={card.limit == null}
            initialValue={card.limit != null ? String(card.limit) : ''}
            inputType="currency"
            sub={card.limit != null ? 'Editable' : undefined}
            onSave={async (raw) => {
              const trimmed = raw.trim();
              if (trimmed === '') {
                return patchAccount(card.id, { creditLimit: null }).then((r) => {
                  if (r.ok) onUpdated();
                  return r;
                });
              }
              const num = Number(trimmed.replace(/[$,]/g, ''));
              if (Number.isNaN(num) || num < 0) {
                return { ok: false, error: 'Enter a non-negative number.' };
              }
              const r = await patchAccount(card.id, { creditLimit: num });
              if (r.ok) onUpdated();
              return r;
            }}
          />

          <EditableStat
            label="APR"
            display={card.apr != null ? card.apr + '%' : 'Click to set'}
            isPlaceholder={card.apr == null}
            initialValue={card.apr != null ? String(card.apr) : ''}
            inputType="percent"
            sub={card.apr != null ? 'Variable purchase APR' : undefined}
            onSave={async (raw) => {
              const trimmed = raw.trim();
              if (trimmed === '') {
                return patchAccount(card.id, { apr: null }).then((r) => {
                  if (r.ok) onUpdated();
                  return r;
                });
              }
              const num = Number(trimmed.replace(/[%]/g, ''));
              if (Number.isNaN(num) || num < 0 || num > 100) {
                return { ok: false, error: 'Enter a percent between 0 and 100.' };
              }
              const r = await patchAccount(card.id, { apr: num });
              if (r.ok) onUpdated();
              return r;
            }}
          />

          <EditableStat
            label="Opened"
            display={
              card.openedDate
                ? `${fmtDate(card.openedDate, { short: true })}, ${new Date(card.openedDate + 'T00:00:00').getFullYear()}`
                : 'Click to set'
            }
            isPlaceholder={card.openedDate == null}
            initialValue={card.openedDate ?? ''}
            inputType="date"
            max={card.earliestTxnDate ?? TODAY}
            sub={cardAge(card.openedDate)}
            onSave={async (raw) => {
              const trimmed = raw.trim();
              if (trimmed === '') {
                return patchAccount(card.id, { openedAt: null }).then((r) => {
                  if (r.ok) onUpdated();
                  return r;
                });
              }
              if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return { ok: false, error: 'Use YYYY-MM-DD.' };
              }
              const r = await patchAccount(card.id, { openedAt: trimmed });
              if (r.ok) onUpdated();
              return r;
            }}
          />
        </div>
      </div>

      <div className="cc-inline-bottom">
        {card.benefits && card.benefits.length > 0 ? (
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
        ) : (
          <div className="drawer-section">
            <div className="h">Benefits</div>
            <div className="benefits-list">
              <div className="benefit-row" style={{ color: 'var(--text-3)' }}>
                <span className="dot" />
                <span>Not on file yet</span>
              </div>
            </div>
          </div>
        )}
        {card.balance > 0 && card.apr != null && (
          <PayoffCalc balance={card.balance} apr={card.apr} />
        )}
        <div className="drawer-section">
          <div className="h">Rewards & fees</div>
          <div className="drawer-grid">
            <div className="drawer-stat green">
              <span className="lbl">Cashback YTD</span>
              <span className="val num">{fmtMoney(card.cashbackYTD)}</span>
              <span className="sub">Net of fees</span>
            </div>
            <div className="drawer-stat">
              <span className="lbl">Annual fee</span>
              <span className="val num">
                {card.annualFee != null ? (card.annualFee > 0 ? fmtMoney(card.annualFee) : '$0') : '—'}
              </span>
              <span className="sub">
                {card.annualFeeDueDate
                  ? `Next ${fmtDate(card.annualFeeDueDate, { short: true })}`
                  : card.annualFee === 0 ? 'No fee' : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="drawer-section">
          <div className="h">Signup bonus &amp; benefits</div>
          <SignupBonusEditor card={card} onUpdated={onUpdated} />
          <div className="cc-benefits-label">Benefits</div>
          <BenefitsEditor card={card} onUpdated={onUpdated} />
        </div>
      </div>

    </div>
  );
}

function HeroTiles({ s }: { s: Summary }) {
  return (
    <div className="cc-tiles">
      <section className="card cc-tile">
        <span className="lbl">Total balance</span>
        <span className="val num">{fmtMoney(s.totalBalance)}</span>
        <span className="sub">
          Across <b className="num">{s.cardCount}</b> active card{s.cardCount === 1 ? '' : 's'}
        </span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Utilization</span>
        <span className="val num">{fmtPct(s.util)}</span>
        <span className="sub">
          {s.totalLimit != null
            ? <>of <span className="num">{fmtMoney0(s.totalLimit)}</span> limit</>
            : 'Set limits per card below'}
          {s.overThirty > 0 && <> · <span className="neg">{s.overThirty} over 30%</span></>}
        </span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Available</span>
        <span className="val num">{fmtMoney0(s.available)}</span>
        <span className="sub">Headroom to spend</span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Interest / mo</span>
        <span className="val num">{s.interestMonthly != null ? fmtMoney(s.interestMonthly) : '—'}</span>
        <span className="sub">
          {s.interestMonthly != null ? 'Est. at current balances & APR' : 'Add balances + APR'}
        </span>
      </section>
      <section className="card cc-tile">
        <span className="lbl">Cashback YTD</span>
        <span className="val num">{fmtMoney(s.cashbackYTD)}</span>
        <span className="sub">
          {s.netCashback != null ? (
            <>Net of fees <span className={s.netCashback >= 0 ? 'pos' : 'neg'}>
              {fmtMoney(s.netCashback, { sign: true })}
            </span></>
          ) : 'Awaiting cashback category wiring'}
        </span>
      </section>
    </div>
  );
}

function MasterUtil({ s }: { s: Summary }) {
  if (s.util == null || s.totalLimit == null) {
    return (
      <section className="card master-util">
        <div className="master-util-hd">
          <span className="ttl">Total utilization</span>
          <span className="util-pct">—</span>
        </div>
        <p className="master-util-empty">
          Set a credit limit on each card (expand a row → click &ldquo;Credit limit&rdquo;)
          and this bar will light up.
        </p>
      </section>
    );
  }
  const pct = Math.min(100, s.util);
  const thresholds = [
    { v: 10, label: 'Ideal' },
    { v: 30, label: 'Good' },
    { v: 50, label: 'High' },
  ];
  return (
    <section className="card master-util">
      <div className="master-util-hd">
        <span className="ttl">Total utilization</span>
        <span className="util-pct">
          {fmtPct(s.util)}
          <span className="of num">{fmtMoney0(s.totalBalance)} / {fmtMoney0(s.totalLimit)}</span>
        </span>
      </div>
      <div className="util-bar">
        <div className="fill" style={{ width: pct + '%', background: utilColor(s.util) }} />
        {thresholds.map((th) => (
          <div key={th.v} className="marker" style={{ left: th.v + '%' }} />
        ))}
      </div>
      <div className="util-markers">
        <span className="threshold"><span className="v">0%</span></span>
        {thresholds.map((th) => (
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

// ─── Add-card modal ────────────────────────────────────────────────────────
function AddCardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
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
      type: 'credit_card',
    };
    if (institution.trim()) body.institution = institution.trim();
    if (last4.trim()) body.accountNumber = last4.trim();
    if (openedAt) body.openedAt = openedAt;
    if (creditLimit.trim()) {
      const n = Number(creditLimit.replace(/[$,]/g, ''));
      if (Number.isNaN(n) || n < 0) {
        setSaving(false);
        setError('Credit limit must be a non-negative number.');
        return;
      }
      body.creditLimit = n;
    }
    if (apr.trim()) {
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

  return (
    <div className="cc-modal-root">
      <div className="cc-modal-backdrop" onClick={onClose}>
        <form className="cc-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
          <h2>Add a credit card</h2>
          {error && <div className="error-banner">{error}</div>}
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chase Sapphire Reserve"
              maxLength={120}
              autoFocus
              required
            />
          </label>
          <label>
            Institution
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g. Chase"
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
          <div className="actions">
            <button type="button" className="pg-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="pg-btn primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Grid view card ───────────────────────────────────────────────────────
function CardGridItem({
  card,
  displayName,
  isDragging,
  dropEdge,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  card: CreditCardData;
  displayName: string;
  isDragging: boolean;
  dropEdge: 'before' | 'after' | null;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const hasLimit = card.limit != null && card.limit > 0;
  const util = hasLimit ? (card.balance / (card.limit as number)) * 100 : null;
  const cls =
    'cc-grid-card' +
    (isDragging ? ' dragging' : '') +
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
      <CardArt card={card} />
      <div className="grid-name">{displayName}</div>
      <div className="grid-sub">
        {card.institution && <span>{card.institution}</span>}
        {card.last4 && <span className="num">•••• {card.last4}</span>}
        <StateChip card={card} />
        {card.apr != null && <span className="cc-apr">APR {card.apr}%</span>}
      </div>
      <div className="grid-bal-row">
        <span className={'grid-bal num' + (card.balance > 0 ? ' red' : '')}>
          {card.balance > 0 ? fmtMoney(card.balance) : '$0.00'}
        </span>
        {monthlyInterest(card) != null && (
          <span className="grid-interest num">~{fmtMoney(monthlyInterest(card))}/mo</span>
        )}
      </div>
      <div className="grid-util">
        {hasLimit && util != null ? (
          <>
            <div className="meta">
              <span>Util</span>
              <span className="pct" style={{ color: utilColor(util) }}>{fmtPct(util, util < 1 ? 1 : 0)}</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: Math.min(100, util) + '%', background: utilColor(util) }} />
            </div>
            <div className="meta">
              <span>
                {fmtMoney0(card.balance)} of {fmtMoney0(card.limit)}
              </span>
            </div>
          </>
        ) : (
          <span className="placeholder">No credit limit on file</span>
        )}
      </div>
    </div>
  );
}

// ─── Detail modal (used in grid view) ─────────────────────────────────────
function CardDetailModal({
  card,
  displayName,
  onClose,
  onUpdated,
}: {
  card: CreditCardData;
  displayName: string;
  onClose: () => void;
  onUpdated: () => void;
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
          className="cc-detail-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={`${displayName} details`}
        >
          <div className="cc-detail-modal-header">
            <CardArt card={card} />
            <div className="cc-detail-modal-title">
              <h2>{displayName}</h2>
              <p>
                {card.institution}
                {card.last4 ? ` · •••• ${card.last4}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="cc-detail-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="cc-detail-modal-body">
            <InlineDetails
              card={card}
              onUpdated={() => {
                onUpdated();
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main client component ─────────────────────────────────────────────────
const ORDER_KEY = 'cc:order';

export function CreditCardsClient({ cards }: { cards: CreditCardData[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Keeps the most-recently-opened card's content mounted briefly after close
  // so the height-collapse transition has real content to shrink against.
  const [shownId, setShownId] = useState<string | null>(null);
  const shownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'closed'>('active');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [cardSize, setCardSize] = useState<'compact' | 'default' | 'large'>('default');
  useEffect(() => {
    try {
      const v = localStorage.getItem('cc:cardSize');
      if (v === 'compact' || v === 'default' || v === 'large') setCardSize(v);
    } catch { /* ignore */ }
  }, []);
  const changeCardSize = (s: 'compact' | 'default' | 'large') => {
    setCardSize(s);
    try { localStorage.setItem('cc:cardSize', s); } catch { /* ignore */ }
  };
  const [sortBy, setSortBy] = useState<SortId>('manual');
  const [filterBy, setFilterBy] = useState<FilterId>('all');
  // Manual order (grid view) + drag-and-drop state
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

  useEffect(() => {
    if (selectedId) {
      if (shownTimerRef.current) clearTimeout(shownTimerRef.current);
      setShownId(selectedId);
    } else if (shownId) {
      shownTimerRef.current = setTimeout(() => setShownId(null), 500);
    }
    return () => {
      if (shownTimerRef.current) clearTimeout(shownTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (raw) setManualOrder(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(manualOrder));
    } catch {
      // ignore
    }
  }, [manualOrder]);

  async function renameCard(cardId: string, newName: string) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return;
    const r = await patchAccount(cardId, { name: trimmed });
    if (r.ok) router.refresh();
    else alert(r.error);
  }
  const displayNameOf = (card: CreditCardData) => card.name;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedId) setSelectedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const active = cards.filter((c) => c.isActive);
  const closed = cards.filter((c) => !c.isActive);
  const summary = useMemo(() => ccSummary(cards), [cards]);

  const sortedActive = useMemo(() => {
    const filtered = active.filter((c) => {
      switch (filterBy) {
        case 'balance': return c.balance > 0;
        case 'paid': return c.balance === 0;
        default: return true;
      }
    });
    const sorted = [...filtered];
    const utilOf = (c: CreditCardData) =>
      c.limit != null && c.limit > 0 ? (c.balance / c.limit) * 100 : 0;
    switch (sortBy) {
      case 'manual': {
        if (manualOrder.length > 0) {
          const idx = new Map(manualOrder.map((id, i) => [id, i]));
          sorted.sort((a, b) => {
            const ai = idx.get(a.id);
            const bi = idx.get(b.id);
            if (ai != null && bi != null) return ai - bi;
            if (ai != null) return -1;
            if (bi != null) return 1;
            return a.name.localeCompare(b.name);
          });
        }
        break;
      }
      case 'balance':
        sorted.sort((a, b) => b.balance - a.balance); break;
      case 'util':
        sorted.sort((a, b) => utilOf(b) - utilOf(a)); break;
      case 'cashback':
        sorted.sort((a, b) => (b.cashbackYTD ?? 0) - (a.cashbackYTD ?? 0)); break;
      case 'opened':
        sorted.sort((a, b) =>
          new Date(b.openedDate || '1970-01-01').getTime() -
          new Date(a.openedDate || '1970-01-01').getTime(),
        ); break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      default:
        break;
    }
    return sorted;
  }, [active, sortBy, filterBy, manualOrder]);

  const filterCounts: Record<FilterId, number> = useMemo(() => ({
    all: active.length,
    balance: active.filter((c) => c.balance > 0).length,
    paid: active.filter((c) => c.balance === 0).length,
  }), [active]);

  // Grid view uses the same sorted+filtered list as list view (sortBy is shared).
  const gridFiltered = sortedActive;

  function onCardDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    setSelectedId(null);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  }
  function onCardDragOver(e: React.DragEvent, id: string) {
    if (!draggingId || id === draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    setDropTarget((cur) =>
      cur && cur.id === id && cur.edge === edge ? cur : { id, edge },
    );
  }
  function onCardDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!sourceId || sourceId === targetId || !target) return;

    const visibleIds = gridFiltered.map((c) => c.id);
    const visibleSet = new Set(visibleIds);
    const allActiveIds = active.map((c) => c.id);

    const next = [...visibleIds];
    const sourceIdx = next.indexOf(sourceId);
    let targetIdx = next.indexOf(target.id);
    if (sourceIdx === -1 || targetIdx === -1) return;
    next.splice(sourceIdx, 1);
    if (sourceIdx < targetIdx) targetIdx -= 1;
    const insertAt = target.edge === 'before' ? targetIdx : targetIdx + 1;
    next.splice(insertAt, 0, sourceId);

    const base = manualOrder.length > 0 ? manualOrder : allActiveIds;
    const merged: string[] = [];
    let cursor = 0;
    for (const id of base) {
      if (visibleSet.has(id)) merged.push(next[cursor++]!);
      else merged.push(id);
    }
    for (const id of allActiveIds) if (!merged.includes(id)) merged.push(id);
    setManualOrder(merged);
    // Switch sort to manual so the user's drag actually takes effect immediately.
    if (sortBy !== 'manual') setSortBy('manual');
  }
  function onCardDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <>
      <div className="cc-toolbar">
        <div className="cc-toolbar-left">
          <div className="cc-status" role="tablist" aria-label="Active or closed cards">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'active'}
              className={activeTab === 'active' ? 'active' : ''}
              onClick={() => { setActiveTab('active'); setSelectedId(null); }}
            >
              Active <span className="count num">{active.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'closed'}
              className={activeTab === 'closed' ? 'active' : ''}
              onClick={() => { setActiveTab('closed'); setSelectedId(null); }}
            >
              Closed <span className="count num">{closed.length}</span>
            </button>
          </div>
          {activeTab === 'active' && (
            <div className="cc-filter-chips" role="group" aria-label="Filter cards">
              {FILTER_OPTIONS.map((opt) => {
                const count = filterCounts[opt.id];
                const disabled = count === 0 && opt.id !== 'all';
                return (
                  <button
                    type="button"
                    key={opt.id}
                    className={'cc-chip' + (filterBy === opt.id ? ' active' : '')}
                    onClick={() => { setFilterBy(opt.id); setSelectedId(null); }}
                    disabled={disabled}
                    style={disabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                  >
                    {opt.label}
                    <span className="count num">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {activeTab === 'active' && (
          <div className="cc-toolbar-right">
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
            <div
              className="view-toggle cc-size"
              role="group"
              aria-label="Card size"
              style={{ visibility: view === 'grid' ? undefined : 'hidden' }}
            >
              {(['compact', 'default', 'large'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cardSize === s ? 'active' : ''}
                  aria-pressed={cardSize === s}
                  onClick={() => changeCardSize(s)}
                  title={s === 'compact' ? 'Compact cards' : s === 'default' ? 'Default cards' : 'Large cards'}
                >
                  {s === 'compact' ? 'S' : s === 'default' ? 'M' : 'L'}
                </button>
              ))}
            </div>
            <label className="cc-sort">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortId)}>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {activeTab === 'active' && (
        <>
          <HeroTiles s={summary} />
          <MasterUtil s={summary} />
          {view === 'grid' ? (
            gridFiltered.length === 0 ? (
              <div className="card cc-no-results">No cards match this filter.</div>
            ) : (
              <div className={'cc-grid' + (cardSize !== 'default' ? ' ' + cardSize : '')}>
                {gridFiltered.map((c) => (
                  <CardGridItem
                    key={c.id}
                    card={c}
                    displayName={displayNameOf(c)}
                    isDragging={draggingId === c.id}
                    dropEdge={dropTarget?.id === c.id ? dropTarget.edge : null}
                    onClick={() => setSelectedId(c.id)}
                    onDragStart={(e) => onCardDragStart(e, c.id)}
                    onDragOver={(e) => onCardDragOver(e, c.id)}
                    onDrop={(e) => onCardDrop(e, c.id)}
                    onDragEnd={onCardDragEnd}
                  />
                ))}
              </div>
            )
          ) : sortedActive.length === 0 ? (
            <div className="card cc-no-results">No cards match this filter.</div>
          ) : (
            <div className="cc-list">
              {sortedActive.map((c) => {
                const isOpen = selectedId === c.id;
                const showContent = isOpen || shownId === c.id;
                return (
                  <div key={c.id} className={'cc-row-wrap' + (isOpen ? ' open' : '')}>
                    <CardRow
                      card={c}
                      displayName={displayNameOf(c)}
                      onClick={() => setSelectedId(isOpen ? null : c.id)}
                      onRename={(name) => renameCard(c.id, name)}
                    />
                    <div className="cc-expand" aria-hidden={!isOpen}>
                      <div className="cc-expand-inner">
                        {showContent && (
                          <InlineDetails
                            card={c}
                            onUpdated={() => router.refresh()}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'closed' && (
        closed.length === 0 ? (
          <div className="card empty-state">No closed cards.</div>
        ) : (
          <div className="cc-list">
            {closed.map((c) => (
              <div key={c.id} className="cc-row-wrap" style={{ opacity: 0.75 }}>
                <div className="cc-row">
                  <CardArt card={c} />
                  <div className="cc-name-col">
                    <div className="top">
                      <span className="n">{displayNameOf(c)}</span>
                      <span className="pill" style={{ background: 'var(--surface-elev)', color: 'var(--text-3)' }}>
                        Closed
                      </span>
                    </div>
                    <div className="sub">
                      {c.institution && <span className="b">{c.institution}</span>}
                      {c.closedDate && (
                        <>
                          <span className="dot">·</span>
                          <span>Closed {fmtDate(c.closedDate, { short: true })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="cc-util" style={{ color: 'var(--text-3)' }}>
                    {c.openedDate && c.closedDate && (
                      <div className="meta">
                        <span>Open</span>
                        <span className="pct">
                          {(daysBetween(c.openedDate, c.closedDate) / 365.25).toFixed(1)} yrs
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="cc-bal" style={{ color: 'var(--text-3)' }}>
                    {c.lifetimeSpend != null && c.lifetimeSpend > 0 ? (
                      <>
                        <span className="b num" style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 600 }}>
                          {fmtMoney0(c.lifetimeSpend)}
                        </span>
                        <span className="of">charged over its life</span>
                      </>
                    ) : (
                      <span className="b" style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>—</span>
                    )}
                  </div>
                  <div className="cc-chev" />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {view === 'grid' && selectedId && (() => {
        const card = cards.find((c) => c.id === selectedId);
        if (!card) return null;
        return (
          <CardDetailModal
            card={card}
            displayName={displayNameOf(card)}
            onClose={() => setSelectedId(null)}
            onUpdated={() => router.refresh()}
          />
        );
      })()}
    </>
  );
}
