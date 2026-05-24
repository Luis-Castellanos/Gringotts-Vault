'use client';

import Image from 'next/image';
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
  // Still stubs ↓
  annualFee: number | null;
  annualFeeDueDate: string | null;
  statementBalance: number | null;
  statementClosingDate: string | null;
  dueDate: string | null;
  minPayment: number | null;
  cashbackYTD: number | null;
  signupBonus: SignupBonus | null;
  benefits: string[] | null;
  isNoPreset: boolean;
  network: string | null;
  state: 'steady' | 'signup_bonus' | 'fee_due';
};

// ─── Constants ─────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

const SORT_OPTIONS = [
  { id: 'smart', label: 'Recommended' },
  { id: 'balance', label: 'Balance · high → low' },
  { id: 'util', label: 'Utilization · high → low' },
  { id: 'dueDate', label: 'Due date · soonest' },
  { id: 'cashback', label: 'Cashback YTD' },
  { id: 'opened', label: 'Newest first' },
  { id: 'name', label: 'Name (A→Z)' },
] as const;

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'balance', label: 'Has balance' },
  { id: 'paid', label: 'Paid in full' },
  { id: 'signup', label: 'Signup bonus' },
  { id: 'fee', label: 'Fee due' },
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
function relDays(iso: string | null): string | null {
  if (!iso) return null;
  const n = daysBetween(TODAY, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
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
function utilTone(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 30) return 'green';
  if (pct <= 50) return 'amber';
  return 'red';
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
};

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
  return {
    cardCount: active.length,
    totalLimit, totalBalance, util, cashbackYTD, annualFees, netCashback, available,
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
  inputType: 'currency' | 'percent' | 'date';
  sub?: string;
  max?: string; // for date inputs
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
    const inputProps: React.InputHTMLAttributes<HTMLInputElement> =
      inputType === 'date'
        ? { type: 'date', max }
        : { type: 'text', inputMode: 'decimal', placeholder: inputType === 'currency' ? '0.00' : '0.0' };
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
    <div
      className="drawer-stat is-editable"
      onClick={start}
      title="Click to edit"
    >
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
  const tone = util != null ? utilTone(util) : 'green';
  return (
    <div className="cc-row" onClick={onClick}>
      <CardArt card={card} />
      <div className="cc-name-col">
        <div className="top">
          <EditableCardName value={displayName} onCommit={onRename} />
          <StateChip card={card} />
        </div>
        <div className="sub">
          {card.institution && <span className="b">{card.institution}</span>}
          {card.dueDate && (
            <>
              <span className="dot">·</span>
              <span>Due {fmtDate(card.dueDate, { short: true })}</span>
            </>
          )}
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
              <span className={'pct ' + tone}>{fmtPct(util, util < 1 ? 1 : 0)}</span>
            </div>
            <div className="bar">
              <div className={'fill ' + tone} style={{ width: Math.min(100, util) + '%' }} />
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
          {card.statementBalance != null && card.statementBalance !== card.balance
            ? <>Stmt {fmtMoney0(card.statementBalance)}</>
            : card.apr != null ? <>APR {card.apr}%</> : <>—</>}
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

function InlineDetails({
  card,
  onUpdated,
}: {
  card: CreditCardData;
  onUpdated: () => void;
}) {
  const hasLimit = card.limit != null && card.limit > 0;
  const util = hasLimit ? (card.balance / (card.limit as number)) * 100 : null;
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function handleClose() {
    if (!confirm(`Mark "${card.displayName}" as closed? It'll move to the Closed tab. You can re-open it later.`)) return;
    setClosing(true);
    setCloseError(null);
    const result = await patchAccount(card.id, { isActive: false });
    setClosing(false);
    if (!result.ok) {
      setCloseError(result.error);
      return;
    }
    onUpdated();
  }

  return (
    <div className="cc-expand-content">
      {(card.state === 'signup_bonus' || card.state === 'fee_due') && <StateCard card={card} />}

      <div className="drawer-section">
        <div className="h">Balance · this cycle</div>
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
          <div className="drawer-stat">
            <span className="lbl">Statement balance</span>
            <span className="val num">{fmtMoney(card.statementBalance)}</span>
            <span className="sub">
              {card.statementClosingDate
                ? `Closes ${fmtDate(card.statementClosingDate, { short: true })}`
                : '—'}
            </span>
          </div>
          <div className="drawer-stat">
            <span className="lbl">Min payment</span>
            <span className="val num">{fmtMoney(card.minPayment)}</span>
            <span className="sub">
              {card.dueDate
                ? `Due ${fmtDate(card.dueDate, { short: true })} · ${relDays(card.dueDate)}`
                : '—'}
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
      </div>

      <div className="cc-actions">
        {closeError && (
          <span className="edit-error" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {closeError}
          </span>
        )}
        <button
          type="button"
          className="pg-btn danger"
          onClick={handleClose}
          disabled={closing}
        >
          {closing ? 'Closing…' : 'Mark as closed'}
        </button>
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
  const tone = utilTone(s.util);
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
        <div className={'fill ' + tone} style={{ width: pct + '%' }} />
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

// ─── Main client component ─────────────────────────────────────────────────
const NICKNAMES_KEY = 'cc:nicknames';

export function CreditCardsClient({ cards }: { cards: CreditCardData[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'closed'>('active');
  const [sortBy, setSortBy] = useState<SortId>('smart');
  const [filterBy, setFilterBy] = useState<FilterId>('all');
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NICKNAMES_KEY);
      if (raw) setNicknames(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(NICKNAMES_KEY, JSON.stringify(nicknames));
    } catch {
      // ignore
    }
  }, [nicknames]);

  function setCardNickname(cardId: string, value: string) {
    setNicknames((prev) => {
      const next = { ...prev };
      const trimmed = (value || '').trim();
      if (!trimmed) delete next[cardId];
      else next[cardId] = trimmed;
      return next;
    });
  }
  const displayNameOf = (card: CreditCardData) =>
    nicknames[card.id] || card.displayName || card.name;

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
    const stateRank: Record<CreditCardData['state'], number> = {
      signup_bonus: 0, fee_due: 1, steady: 2,
    };
    const filtered = active.filter((c) => {
      switch (filterBy) {
        case 'balance': return c.balance > 0;
        case 'paid': return c.balance === 0;
        case 'signup': return c.state === 'signup_bonus';
        case 'fee': return c.state === 'fee_due';
        default: return true;
      }
    });
    const sorted = [...filtered];
    const utilOf = (c: CreditCardData) =>
      c.limit != null && c.limit > 0 ? (c.balance / c.limit) * 100 : 0;
    const dueOf = (c: CreditCardData) =>
      c.dueDate ? new Date(c.dueDate).getTime() : Infinity;
    switch (sortBy) {
      case 'balance':
        sorted.sort((a, b) => b.balance - a.balance); break;
      case 'util':
        sorted.sort((a, b) => utilOf(b) - utilOf(a)); break;
      case 'dueDate':
        sorted.sort((a, b) => dueOf(a) - dueOf(b)); break;
      case 'cashback':
        sorted.sort((a, b) => (b.cashbackYTD ?? 0) - (a.cashbackYTD ?? 0)); break;
      case 'opened':
        sorted.sort((a, b) =>
          new Date(b.openedDate || '1970-01-01').getTime() -
          new Date(a.openedDate || '1970-01-01').getTime(),
        ); break;
      case 'name':
        sorted.sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b))); break;
      case 'smart':
      default:
        sorted.sort((a, b) => {
          const r = (stateRank[a.state] ?? 9) - (stateRank[b.state] ?? 9);
          if (r !== 0) return r;
          if (b.balance !== a.balance) return b.balance - a.balance;
          return (b.limit ?? 0) - (a.limit ?? 0);
        });
        break;
    }
    return sorted;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sortBy, filterBy, nicknames]);

  const filterCounts: Record<FilterId, number> = useMemo(() => ({
    all: active.length,
    balance: active.filter((c) => c.balance > 0).length,
    paid: active.filter((c) => c.balance === 0).length,
    signup: active.filter((c) => c.state === 'signup_bonus').length,
    fee: active.filter((c) => c.state === 'fee_due').length,
  }), [active]);

  async function reopenCard(id: string) {
    const result = await patchAccount(id, { isActive: true });
    if (result.ok) router.refresh();
    else alert(result.error);
  }

  return (
    <>
      <header className="page-hd">
        <div>
          <h1 className="page-title">Credit cards</h1>
        </div>
        <div className="page-actions">
          <button type="button" className="pg-btn primary" onClick={() => setShowAddModal(true)}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2v10M2 7h10" />
            </svg>
            Add card
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={'tab' + (activeTab === 'active' ? ' active' : '')}
          onClick={() => setActiveTab('active')}
        >
          Active <span className="count num">{active.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={'tab' + (activeTab === 'closed' ? ' active' : '')}
          onClick={() => setActiveTab('closed')}
        >
          Closed <span className="count num">{closed.length}</span>
        </button>
      </nav>

      {activeTab === 'active' && (
        <>
          <HeroTiles s={summary} />
          <MasterUtil s={summary} />
          <div className="cc-toolbar">
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
            <label className="cc-sort">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortId)}>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          {sortedActive.length === 0 ? (
            <div className="card cc-no-results">No cards match this filter.</div>
          ) : (
            <div className="cc-list">
              {sortedActive.map((c) => {
                const isOpen = selectedId === c.id;
                return (
                  <div key={c.id} className={'cc-row-wrap' + (isOpen ? ' open' : '')}>
                    <CardRow
                      card={c}
                      displayName={displayNameOf(c)}
                      onClick={() => setSelectedId(isOpen ? null : c.id)}
                      onRename={(name) => setCardNickname(c.id, name)}
                    />
                    <div className="cc-expand" aria-hidden={!isOpen}>
                      <div className="cc-expand-inner">
                        {isOpen && (
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
                    <span className="b" style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>—</span>
                  </div>
                  <div className="cc-chev">
                    <button
                      type="button"
                      className="pg-btn"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => reopenCard(c.id)}
                      title="Re-open card"
                    >
                      Re-open
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {showAddModal && (
        <AddCardModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
