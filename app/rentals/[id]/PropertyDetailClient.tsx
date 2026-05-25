'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AmortResult } from '@/lib/properties/amortization';
import type { MortgageAccountOption, PropertyRow } from '@/lib/properties/load';
import { PropertyForm, propertyTypeLabel } from '../PropertyForm';
import { addressLine, fmtDate, fmtMoney, fmtMoney0, fmtPct, specLine } from '../format';

function Metric({ label, value, tone, sub }: { label: string; value: string; tone?: 'pos' | 'neg'; sub?: string }) {
  const color = tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : 'text-text-primary';
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1.5">{label}</div>
      <div className={`text-[22px] font-semibold tracking-[-0.01em] tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[12px] text-text-tertiary mt-1">{sub}</div>}
    </section>
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
        <Metric label="Loan amount" value={fmtMoney0(schedule.principal)} sub={`${schedule.aprPct}% · ${Math.round(schedule.termMonths / 12)} yr`} />
        <Metric label="Monthly P&I" value={fmtMoney(schedule.monthlyPayment)} />
        <Metric label="Total interest" value={fmtMoney0(schedule.totalInterest)} sub={`over ${schedule.termMonths} payments`} />
        <Metric
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

export function PropertyDetailClient({
  property,
  schedule,
  mortgageOptions,
}: {
  property: PropertyRow;
  schedule: AmortResult | null;
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
        <Metric label="Market value" value={fmtMoney0(property.marketValue ?? property.acquisitionPrice)} sub={appreciationSub} />
        <Metric label="Loan balance" value={property.loanBalance > 0 ? fmtMoney0(property.loanBalance) : '$0'} tone={property.loanBalance > 0 ? 'neg' : undefined} sub={property.mortgage?.name} />
        <Metric label="Equity" value={fmtMoney0(property.equity)} tone="pos" sub={ePct != null ? `${fmtPct(ePct)} of value` : undefined} />
        <Metric label="Monthly payment" value={property.mortgage?.monthlyPayment != null ? fmtMoney(property.mortgage.monthlyPayment) : '—'} sub="P&I (from mortgage)" />
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

      {/* Future: rental income, expenses, and the principal/interest/escrow split. */}
      <div className="mt-8 rounded-xl border border-dashed border-border-subtle bg-surface-1 px-6 py-5 text-[12.5px] text-text-muted">
        Coming soon: rental income &amp; expenses, monthly cash flow, and splitting your mortgage outflow into principal / interest / escrow.
      </div>

      {editing && <PropertyForm property={property} mortgageOptions={mortgageOptions} onClose={() => setEditing(false)} />}
      {selling && <SellModal property={property} onClose={() => setSelling(false)} />}
    </>
  );
}
