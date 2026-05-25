'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AmortResult } from '@/lib/properties/amortization';
import type { MortgageAccountOption, PropertyRow } from '@/lib/properties/load';
import type { FinCategory, PropertyFinancials, TTM } from '@/lib/properties/financials';
import type { LeaseRow } from '@/lib/properties/leases';
import type { MaintenanceRow } from '@/lib/properties/maintenance';
import type { ScheduleE } from '@/lib/properties/schedule-e';
import { StatTile } from '@/components/StatTile';
import { PropertyForm, propertyTypeLabel } from '../PropertyForm';
import { addressLine, fmtDate, fmtMoney, fmtMoney0, fmtPct, specLine } from '../format';
import { LeaseForm } from './LeaseForm';
import { MaintenanceForm } from './MaintenanceForm';

function ScheduleESection({ se }: { se: ScheduleE }) {
  const router = useRouter();
  const cur = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => cur - i);
  const expenseLines = se.lines.filter((l) => l.amount !== 0);
  const hasData = se.rents !== 0 || se.totalExpenses !== 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-[15px] font-semibold">Tax · Schedule E <span className="text-[12px] font-normal text-text-tertiary">· {se.year}</span></h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
            value={se.year}
            onChange={(e) => router.push(`/rentals/${se.propertyId}?seYear=${e.target.value}`)}
            aria-label="Tax year"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <a href={`/api/export/schedule-e?propertyId=${se.propertyId}&year=${se.year}`} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">
            Export ↓
          </a>
        </div>
      </div>
      {!hasData ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
          No income or expenses attributed to this property in {se.year}. Tag transactions to it (and add rent) to build the Schedule E worksheet.
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden text-[13px]">
          <div className="flex justify-between px-4 py-2.5 border-b border-border-subtle">
            <span className="text-text-secondary">Rents received <span className="text-text-muted">(line 3)</span></span>
            <span className="tabular-nums text-positive">{fmtMoney0(se.rents)}</span>
          </div>
          {expenseLines.map((l) => (
            <div key={l.key} className="flex justify-between px-4 py-2 border-b border-border-subtle">
              <span className="text-text-tertiary">{l.label} <span className="text-text-muted">(line {l.line})</span></span>
              <span className="tabular-nums text-negative">{fmtMoney0(l.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-2.5 border-b border-border-subtle font-medium">
            <span>Total expenses</span>
            <span className="tabular-nums text-negative">{fmtMoney0(se.totalExpenses)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5 font-semibold">
            <span>Net income / (loss)</span>
            <span className={`tabular-nums ${se.netIncome >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtMoney0(se.netIncome)}</span>
          </div>
        </div>
      )}
      <p className="text-[11px] text-text-muted mt-2">Heuristic mapping from your categories to Schedule E lines — review before filing. Depreciation (line 18) is coming.</p>
    </div>
  );
}

const MAINT_STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'text-amber-400' },
  in_progress: { label: 'In progress', cls: 'text-cat-blue' },
  done: { label: 'Done', cls: 'text-positive' },
};

function MaintenanceSection({ propertyId, items }: { propertyId: string; items: MaintenanceRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRow | null>(null);
  const openCount = items.filter((i) => i.status !== 'done').length;

  async function del(i: MaintenanceRow) {
    if (!confirm(`Delete the work order "${i.title}"?`)) return;
    const res = await fetch(`/api/maintenance/${i.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else alert('Could not delete work order.');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold">Maintenance {openCount > 0 && <span className="text-[12px] font-normal text-text-tertiary">· {openCount} open</span>}</h2>
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">+ Add work order</button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
          No work orders yet. Log repairs, turnovers, and inspections here.
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          {items.map((i) => (
            <div key={i.id} className="grid grid-cols-[1.6fr_100px_110px_60px] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] items-center first:border-t-0">
              <div className="min-w-0">
                <div className="text-text-primary truncate">{i.title}</div>
                {(i.category || i.vendor || i.openedAt) && (
                  <div className="text-[11.5px] text-text-tertiary truncate">{[i.category, i.vendor, i.openedAt ? fmtDate(i.openedAt) : null].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <div className="text-right tabular-nums">{i.cost != null ? fmtMoney0(i.cost) : '—'}</div>
              <div className={`${MAINT_STATUS[i.status]?.cls ?? 'text-text-tertiary'}`}>{MAINT_STATUS[i.status]?.label ?? i.status}</div>
              <div className="flex gap-1 justify-end text-[12px]">
                <button type="button" onClick={() => setEditing(i)} className="text-text-tertiary hover:text-text-primary">Edit</button>
                <button type="button" onClick={() => del(i)} className="text-text-muted hover:text-negative">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <MaintenanceForm propertyId={propertyId} onClose={() => setAdding(false)} />}
      {editing && <MaintenanceForm propertyId={propertyId} item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const LEASE_STATUS_CLS: Record<string, string> = {
  active: 'text-positive',
  upcoming: 'text-cat-blue',
  vacant: 'text-amber-400',
  past: 'text-text-muted',
};

function RentRollSection({ propertyId, leases }: { propertyId: string; leases: LeaseRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<LeaseRow | null>(null);
  const totalRent = leases.filter((l) => l.status === 'active').reduce((s, l) => s + (l.rentAmount ?? 0), 0);

  async function del(l: LeaseRow) {
    if (!confirm(`Delete the lease${l.tenantName ? ` for ${l.tenantName}` : ''}?`)) return;
    const res = await fetch(`/api/leases/${l.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else alert('Could not delete lease.');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold">Rent roll {totalRent > 0 && <span className="text-[12px] font-normal text-text-tertiary">· {fmtMoney0(totalRent)}/mo active</span>}</h2>
        <button type="button" onClick={() => setAdding(true)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">+ Add lease</button>
      </div>
      {leases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
          No leases yet. Add one to track tenant, rent, deposit, and term.
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_110px_150px_90px_70px] gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            <div>Unit · Tenant</div>
            <div className="text-right">Rent/mo</div>
            <div>Term</div>
            <div>Status</div>
            <div />
          </div>
          {leases.map((l) => (
            <div key={l.id} className="grid grid-cols-[1.4fr_110px_150px_90px_70px] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] items-center first:border-t-0">
              <div className="min-w-0">
                <div className="text-text-primary truncate">{l.tenantName || (l.unit ? `Unit ${l.unit}` : 'Lease')}</div>
                {(l.unit || l.tenantContact) && <div className="text-[11.5px] text-text-tertiary truncate">{[l.unit && `Unit ${l.unit}`, l.tenantContact].filter(Boolean).join(' · ')}</div>}
              </div>
              <div className="text-right tabular-nums">{l.rentAmount != null ? fmtMoney0(l.rentAmount) : '—'}</div>
              <div className="text-text-tertiary text-[12px]">{l.startDate ? fmtDate(l.startDate) : '—'}{l.endDate ? ` – ${fmtDate(l.endDate)}` : ''}</div>
              <div className={`capitalize ${LEASE_STATUS_CLS[l.status] ?? 'text-text-tertiary'}`}>{l.status}</div>
              <div className="flex gap-1 justify-end text-[12px]">
                <button type="button" onClick={() => setEditing(l)} className="text-text-tertiary hover:text-text-primary">Edit</button>
                <button type="button" onClick={() => del(l)} className="text-text-muted hover:text-negative">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <LeaseForm propertyId={propertyId} onClose={() => setAdding(false)} />}
      {editing && <LeaseForm propertyId={propertyId} lease={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AmortizationSection({ schedule }: { schedule: AmortResult }) {
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
  if (!schedule.ok) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
        Can&rsquo;t build an amortization schedule yet — {schedule.reason}{' '}
        Set the loan terms on the{' '}
        <Link href="/accounts" className="text-accent-300 underline">Accounts page</Link>.
      </div>
    );
  }

  const progressPct =
    schedule.currentBalance != null && schedule.principal > 0
      ? Math.max(0, Math.min(100, ((schedule.principal - schedule.currentBalance) / schedule.principal) * 100))
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Loan summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Loan amount" value={fmtMoney0(schedule.principal)} sub={`${schedule.aprPct}% · ${Math.round(schedule.termMonths / 12)} yr`} />
        <StatTile label="Monthly P&I" value={fmtMoney(schedule.monthlyPayment)} />
        <StatTile label="Total interest" value={fmtMoney0(schedule.totalInterest)} sub={`over ${schedule.termMonths} payments`} />
        <StatTile
          label="Current balance"
          value={schedule.currentBalance != null ? fmtMoney0(schedule.currentBalance) : '—'}
          sub={schedule.payoffDate ? `paid off ${fmtDate(schedule.payoffDate)}` : undefined}
        />
      </div>

      {progressPct != null && (
        <div>
          <div className="flex justify-between text-[12px] text-text-tertiary mb-1.5">
            <span>Paid down {fmtPct(progressPct)}</span>
            <span className="tabular-nums">{schedule.monthsElapsed} of {schedule.termMonths} payments</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-positive" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Schedule table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold">Amortization schedule</h3>
          <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[12px]">
            {(['yearly', 'monthly'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${
                  view === v ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            <div>{view === 'yearly' ? 'Year' : 'Payment'}</div>
            <div className="text-right">Payment</div>
            <div className="text-right">Principal</div>
            <div className="text-right">Interest</div>
            <div className="text-right">Balance</div>
          </div>
          <div className="max-h-[460px] overflow-y-auto">
            {view === 'yearly'
              ? schedule.years.map((y) => (
                  <div key={y.label} className="grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] tabular-nums first:border-t-0">
                    <div className="text-text-secondary">{y.label}</div>
                    <div className="text-right text-text-tertiary">{fmtMoney0(y.payment)}</div>
                    <div className="text-right text-positive">{fmtMoney0(y.principal)}</div>
                    <div className="text-right text-negative">{fmtMoney0(y.interest)}</div>
                    <div className="text-right">{fmtMoney0(y.endBalance)}</div>
                  </div>
                ))
              : schedule.rows.map((r) => {
                  const isCurrent = schedule.monthsElapsed != null && r.index === schedule.monthsElapsed;
                  return (
                    <div
                      key={r.index}
                      className={`grid grid-cols-[1fr_repeat(4,minmax(0,1fr))] gap-3 px-4 py-2 border-t border-border-subtle text-[13px] tabular-nums first:border-t-0 ${
                        isCurrent ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <div className="text-text-tertiary">{r.date ?? `#${r.index}`}</div>
                      <div className="text-right text-text-tertiary">{fmtMoney(r.payment)}</div>
                      <div className="text-right text-positive">{fmtMoney(r.principal)}</div>
                      <div className="text-right text-negative">{fmtMoney(r.interest)}</div>
                      <div className="text-right">{fmtMoney(r.balance)}</div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SellModal({ property, onClose }: { property: PropertyRow; onClose: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState(property.marketValue != null ? String(property.marketValue) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      isActive: false,
      soldDate: date || null,
      soldPrice: price.trim() ? Number(price.replace(/[$,]/g, '')) : null,
    };
    const res = await fetch(`/api/properties/${property.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || json.error) {
      setError(json?.error?.message ?? `HTTP ${res.status}`);
      return;
    }
    router.refresh();
    onClose();
  }

  const field = 'w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-accent-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <form className="w-full max-w-[420px] rounded-2xl bg-surface-1 border border-border-subtle shadow-2xl p-6" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-[18px] font-semibold mb-4">Mark as sold</h2>
        {error && <div className="mb-3 rounded-lg bg-negative/10 border border-negative/30 px-3 py-2 text-[13px] text-negative">{error}</div>}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary">
            Sale date
            <input className={field} type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-text-tertiary">
            Sale price
            <input className={field} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="520000" autoFocus />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="rounded-lg px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 disabled:opacity-60" disabled={saving}>{saving ? 'Saving…' : 'Mark sold'}</button>
        </div>
      </form>
    </div>
  );
}

function FinBreakdown({ title, cats, tone }: { title: string; cats: FinCategory[]; tone: 'pos' | 'neg' }) {
  const max = cats.length ? Math.max(...cats.map((c) => c.amount)) : 1;
  const bar = tone === 'pos' ? 'var(--color-positive)' : 'var(--color-negative)';
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <h3 className="text-[13px] font-semibold mb-3">{title}</h3>
      {cats.length === 0 ? (
        <p className="text-[12.5px] text-text-tertiary py-2">None recorded.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cats.slice(0, 8).map((c) => (
            <div key={c.id} className="relative rounded-lg overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-lg opacity-[0.14]" style={{ width: `${(c.amount / max) * 100}%`, background: c.color ?? bar }} />
              <div className="relative flex justify-between px-3 py-1.5 text-[13px]">
                <span className="truncate text-text-secondary">{c.name}</span>
                <span className="tabular-nums text-text-primary ml-2">{fmtMoney0(c.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReturnsSection({ property, ttm }: { property: PropertyRow; ttm: TTM }) {
  const value = property.marketValue ?? property.acquisitionPrice ?? 0;
  const noi = ttm.noi;
  const annualDebt = property.mortgage?.monthlyPayment != null ? property.mortgage.monthlyPayment * 12 : null;
  // Cash invested ≈ down payment (purchase − original loan); no separate field yet.
  const cashInvested =
    property.acquisitionPrice != null && property.mortgage?.originalPrincipal != null
      ? property.acquisitionPrice - property.mortgage.originalPrincipal
      : null;
  const capRate = value > 0 ? (noi / value) * 100 : null;
  const dscr = annualDebt && annualDebt > 0 ? noi / annualDebt : null;
  const coc = cashInvested && cashInvested > 0 && annualDebt != null ? ((noi - annualDebt) / cashInvested) * 100 : null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatTile label="NOI · TTM" value={fmtMoney0(noi)} tone={noi >= 0 ? 'pos' : 'neg'} sub="income − operating exp." />
      <StatTile label="Cap rate" value={capRate != null ? fmtPct(capRate) : '—'} sub="NOI ÷ value" />
      <StatTile label="Cash-on-cash" value={coc != null ? fmtPct(coc) : '—'} sub={cashInvested != null ? `on ${fmtMoney0(cashInvested)} down` : 'needs purchase + loan'} />
      <StatTile label="DSCR" value={dscr != null ? `${dscr.toFixed(2)}×` : '—'} sub="NOI ÷ debt service" />
    </div>
  );
}

function FinancialsSection({ fin }: { fin: PropertyFinancials }) {
  if (fin.txnCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
        No transactions attributed yet. Tag transactions to this property (the <strong>Property</strong> field when you expand a transaction in Transactions), or link the property&rsquo;s accounts — then rent, expenses, and cash flow appear here.
      </div>
    );
  }
  const months = fin.months.slice(-12);
  const maxM = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Income" value={fmtMoney0(fin.income)} tone="pos" />
        <StatTile label="Expenses" value={fmtMoney0(fin.expenses)} tone="neg" />
        <StatTile label="Net cash flow" value={(fin.net >= 0 ? '+' : '') + fmtMoney0(fin.net)} tone={fin.net >= 0 ? 'pos' : 'neg'} />
      </div>
      {months.length > 1 && (
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold">Monthly cash flow</h3>
            <div className="flex gap-3 text-[11px] text-text-tertiary">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-positive" />Income</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-negative" />Expenses</span>
            </div>
          </div>
          <div className="flex items-end justify-between gap-1.5 h-28">
            {months.map((m) => (
              <div key={m.ym} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 h-24 w-full justify-center">
                  <div className="w-2 rounded-t bg-positive" style={{ height: `${(m.income / maxM) * 100}%` }} title={`Income ${fmtMoney0(m.income)}`} />
                  <div className="w-2 rounded-t bg-negative" style={{ height: `${(m.expenses / maxM) * 100}%` }} title={`Expenses ${fmtMoney0(m.expenses)}`} />
                </div>
                <span className="text-[9px] text-text-muted">{m.ym.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FinBreakdown title="Income" cats={fin.incomeByCategory} tone="pos" />
        <FinBreakdown title="Expenses" cats={fin.expenseByCategory} tone="neg" />
      </div>
    </div>
  );
}

export function PropertyDetailClient({
  property,
  schedule,
  financials,
  leases,
  maintenance,
  scheduleE,
  mortgageOptions,
}: {
  property: PropertyRow;
  schedule: AmortResult | null;
  financials: PropertyFinancials;
  leases: LeaseRow[];
  maintenance: MaintenanceRow[];
  scheduleE: ScheduleE;
  mortgageOptions: MortgageAccountOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const value = property.marketValue ?? property.acquisitionPrice ?? 0;
  const ePct = value > 0 ? (property.equity / value) * 100 : null;

  // Appreciation since purchase (active properties with both figures).
  const appreciation =
    property.isActive && property.marketValue != null && property.acquisitionPrice != null && property.acquisitionPrice > 0
      ? property.marketValue - property.acquisitionPrice
      : null;
  const appreciationSub =
    appreciation != null && property.acquisitionPrice
      ? `${appreciation >= 0 ? '+' : ''}${fmtMoney0(appreciation)} (${fmtPct((appreciation / property.acquisitionPrice) * 100, 1)}) since purchase`
      : property.marketValue == null
        ? 'Using purchase price'
        : undefined;

  const realizedGain =
    !property.isActive && property.soldPrice != null && property.acquisitionPrice != null
      ? property.soldPrice - property.acquisitionPrice
      : null;

  async function reopen() {
    const res = await fetch(`/api/properties/${property.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: true, soldDate: null, soldPrice: null }),
    });
    if (res.ok) router.refresh();
    else alert('Could not reopen property.');
  }

  async function del() {
    if (!confirm(`Delete ${property.name}? This removes the property record (the mortgage account is kept).`)) return;
    setDeleting(true);
    const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/rentals');
      router.refresh();
    } else {
      setDeleting(false);
      alert('Could not delete property.');
    }
  }

  return (
    <>
      <Link href="/rentals" className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary mb-5">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3L5 7l4 4" /></svg>
        Real Estate
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-5 mb-7">
        <div className="md:w-72 shrink-0">
          {property.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={property.imageUrl} alt={property.name} className="h-44 w-full rounded-xl object-cover" />
          ) : (
            <div className="h-44 w-full rounded-xl bg-gradient-to-br from-surface-3 to-surface-2 flex items-center justify-center text-text-muted">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{property.name}</h1>
              <p className="text-[13px] text-text-tertiary mt-0.5">{addressLine(property) || '—'}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {property.isActive ? (
                <button type="button" onClick={() => setSelling(true)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Mark sold</button>
              ) : (
                <button type="button" onClick={reopen} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Reopen</button>
              )}
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Edit</button>
              <button type="button" onClick={del} disabled={deleting} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-negative hover:bg-negative/10 disabled:opacity-60">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-[13px]">
            <span className="text-text-tertiary">{propertyTypeLabel(property.propertyType)}</span>
            {specLine(property) && <span className="text-text-secondary">{specLine(property)}</span>}
            {property.acquisitionDate && <span className="text-text-tertiary">Acquired {fmtDate(property.acquisitionDate)}</span>}
            {property.acquisitionPrice != null && <span className="text-text-tertiary">for {fmtMoney0(property.acquisitionPrice)}</span>}
          </div>
        </div>
      </div>

      {/* Sold banner */}
      {!property.isActive && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-border-subtle bg-surface-2 px-5 py-3 text-[13px]">
          <span className="font-medium text-text-secondary">Sold{property.soldDate ? ` ${fmtDate(property.soldDate)}` : ''}</span>
          {property.soldPrice != null && <span className="text-text-tertiary">for <span className="tabular-nums text-text-primary">{fmtMoney0(property.soldPrice)}</span></span>}
          {realizedGain != null && (
            <span className="text-text-tertiary">
              realized gain{' '}
              <span className={`tabular-nums ${realizedGain >= 0 ? 'text-positive' : 'text-negative'}`}>
                {realizedGain >= 0 ? '+' : ''}{fmtMoney0(realizedGain)}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatTile label="Market value" value={fmtMoney0(property.marketValue ?? property.acquisitionPrice)} sub={appreciationSub} />
        <StatTile label="Loan balance" value={property.loanBalance > 0 ? fmtMoney0(property.loanBalance) : '$0'} tone={property.loanBalance > 0 ? 'neg' : undefined} sub={property.mortgage?.name} />
        <StatTile label="Equity" value={fmtMoney0(property.equity)} tone="pos" sub={ePct != null ? `${fmtPct(ePct)} of value` : undefined} />
        <StatTile label="Monthly payment" value={property.mortgage?.monthlyPayment != null ? fmtMoney(property.mortgage.monthlyPayment) : '—'} sub="P&I (from mortgage)" />
      </div>

      {/* Returns (trailing 12 months) — only once there's attributed activity */}
      {financials.ttm.hasData && (
        <>
          <h2 className="text-[15px] font-semibold mb-3">
            Returns <span className="text-[12px] font-normal text-text-tertiary">· trailing 12 months</span>
          </h2>
          <div className="mb-8">
            <ReturnsSection property={property} ttm={financials.ttm} />
          </div>
        </>
      )}

      {/* Financials (per-property income / expenses / cash flow) */}
      <h2 className="text-[15px] font-semibold mb-3">Financials</h2>
      <div className="mb-8">
        <FinancialsSection fin={financials} />
      </div>

      {/* Rent roll */}
      <div className="mb-8">
        <RentRollSection propertyId={property.id} leases={leases} />
      </div>

      {/* Maintenance */}
      <div className="mb-8">
        <MaintenanceSection propertyId={property.id} items={maintenance} />
      </div>

      {/* Schedule E */}
      <div className="mb-8">
        <ScheduleESection se={scheduleE} />
      </div>

      {/* Mortgage / amortization */}
      <h2 className="text-[15px] font-semibold mb-3">Mortgage</h2>
      {property.mortgage ? (
        schedule ? (
          <AmortizationSection schedule={schedule} />
        ) : null
      ) : (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-8 text-[13px] text-text-tertiary">
          No mortgage linked. <button type="button" onClick={() => setEditing(true)} className="text-accent-300 underline">Link a mortgage account</button> to see the amortization schedule.
        </div>
      )}

      {/* Roadmap: the rest of the Stessa-parity module. */}
      <div className="mt-8 rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-5 text-[12.5px] text-text-muted">
        Coming next: capital-expense &amp; depreciation tracking (Schedule E line 18).
      </div>

      {editing && <PropertyForm property={property} mortgageOptions={mortgageOptions} onClose={() => setEditing(false)} />}
      {selling && <SellModal property={property} onClose={() => setSelling(false)} />}
    </>
  );
}
