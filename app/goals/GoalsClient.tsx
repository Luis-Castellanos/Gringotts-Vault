'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AllocationOverview, GoalView } from '@/lib/goals/load';
import type { SaveStatus } from '@/lib/goals/calc';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0, fmtPct, fmtDate } from '@/lib/format';
import type { Debt } from '@/lib/goals/payoff-scenario';
import { GoalForm, type AccountOption } from './GoalForm';
import { DebtPayoffPlan } from './DebtPayoffPlan';

const STATUS: Record<SaveStatus, { label: string; cls: string }> = {
  reached: { label: 'Reached 🎉', cls: 'text-positive' },
  ahead: { label: 'Ahead', cls: 'text-positive' },
  on_track: { label: 'On track', cls: 'text-cat-blue' },
  at_risk: { label: 'At risk', cls: 'text-amber-400' },
  no_plan: { label: 'No target set', cls: 'text-text-muted' },
};

function monthsLabel(n: number): string {
  if (n <= 0) return 'now';
  if (n < 12) return `${n} mo`;
  const y = Math.floor(n / 12);
  const m = n % 12;
  return m ? `${y}y ${m}m` : `${y} yr`;
}

type Dnd = {
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
};

function GoalCard({ g, dnd, onEdit, onDelete }: { g: GoalView; dnd: Dnd; onEdit: () => void; onDelete: () => void }) {
  const pct = g.progressPct;
  const isPay = g.type === 'pay_down';
  const barColor = isPay ? 'bg-negative' : 'bg-positive';
  return (
    <section
      draggable
      onDragStart={dnd.onDragStart}
      onDragOver={dnd.onDragOver}
      onDrop={(e) => { e.preventDefault(); dnd.onDrop(); }}
      onDragEnd={dnd.onDragEnd}
      className={`group flex flex-col gap-3 rounded-2xl bg-surface-1 border p-5 transition-colors ${
        dnd.dropTarget ? 'border-accent-500 ring-2 ring-accent-500/40' : 'border-border-subtle'
      } ${dnd.dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-text-primary truncate">{g.name}</div>
          <div className="text-[12px] text-text-tertiary">
            {isPay ? 'Pay down' : 'Save up'}
            {g.accounts.length > 0 && <span> · {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="cursor-grab text-text-muted opacity-0 group-hover:opacity-100 px-0.5" title="Drag to reorder" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" /><circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" /></svg>
          </span>
          <button type="button" onClick={onEdit} className="text-[12px] text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-surface-2">Edit</button>
          <button type="button" onClick={onDelete} className="text-[12px] text-text-muted hover:text-negative px-1.5 py-0.5 rounded hover:bg-negative/10">Delete</button>
        </div>
      </div>

      {/* Headline number */}
      <div className="flex items-baseline justify-between">
        <span className="text-[22px] font-semibold tabular-nums tracking-[-0.01em]">{fmtMoney0(g.current)}</span>
        {!isPay && g.targetAmount != null && (
          <span className="text-[13px] text-text-tertiary tabular-nums">of {fmtMoney0(g.targetAmount)}</span>
        )}
        {isPay && <span className="text-[13px] text-text-tertiary">owed</span>}
      </div>

      {/* Progress bar */}
      {pct != null ? (
        <div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11.5px] text-text-muted mt-1">{fmtPct(pct)} {isPay ? 'paid off' : 'of target'}</div>
        </div>
      ) : (
        <div className="text-[11.5px] text-text-muted">{isPay ? 'Add original loan amounts to track payoff %' : 'Set a target to track progress'}</div>
      )}

      {/* Status / projection footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] pt-1 border-t border-border-subtle mt-1">
        {!isPay && g.status && <span className={`font-medium ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>}
        {!isPay && g.projectedDate && <span className="text-text-tertiary">on track for {fmtDate(g.projectedDate)}</span>}
        {!isPay && g.status === 'at_risk' && g.requiredMonthly != null && (
          <span className="text-text-tertiary">needs {fmtMoney0(g.requiredMonthly)}/mo</span>
        )}
        {isPay && g.debtFreeDate && (
          <span className="font-medium text-positive">Debt-free {fmtDate(g.debtFreeDate)}</span>
        )}
        {isPay && g.payoffMonths != null && <span className="text-text-tertiary">{monthsLabel(g.payoffMonths)} left</span>}
        {isPay && g.totalInterest != null && <span className="text-text-tertiary">~{fmtMoney0(g.totalInterest)} interest</span>}
        {isPay && g.payoffMonths == null && <span className="text-text-tertiary">Set APR + payment on the linked accounts</span>}
      </div>
    </section>
  );
}

function AllocationCard({ a }: { a: AllocationOverview }) {
  const pct = Math.max(0, Math.min(100, a.pctAllocated));
  const over = a.available < -0.01;
  return (
    <section className="rounded-2xl bg-surface-1 border border-border-subtle p-5 mb-8">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-[14px] font-semibold">Money assigned to goals</h2>
        <span className="text-[12px] text-text-tertiary tabular-nums">
          {fmtPct(a.pctAllocated)} of {fmtMoney0(a.totalAvailable)} assignable
        </span>
      </div>
      <div className="h-3 rounded-full bg-surface-3 overflow-hidden flex">
        <div className={`h-full ${over ? 'bg-negative' : 'bg-positive'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-4 mt-3 text-[12.5px] flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${over ? 'bg-negative' : 'bg-positive'}`} />
          <span className="text-text-secondary">Assigned</span>
          <span className="tabular-nums font-medium text-text-primary">{fmtMoney0(a.totalAllocated)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-surface-3" />
          <span className="text-text-secondary">{over ? 'Over-assigned' : 'Available to assign'}</span>
          <span className={`tabular-nums font-medium ${over ? 'text-negative' : 'text-text-primary'}`}>{fmtMoney0(a.available)}</span>
        </span>
      </div>
      {a.overAllocated.length > 0 && (
        <div className="mt-3 rounded-lg bg-negative/[0.07] border border-negative/20 px-3 py-2 text-[12px] text-text-secondary">
          <span className="text-negative font-medium">Over-assigned: </span>
          {a.overAllocated.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ', '}
              {o.name} ({fmtMoney0(o.allocated)} assigned vs {fmtMoney0(o.balance)} balance)
            </span>
          ))}
          . The same money is committed to more than one goal.
        </div>
      )}
    </section>
  );
}

export function GoalsClient({ goals, accountOptions, debts, allocation }: { goals: GoalView[]; accountOptions: AccountOption[]; debts: Debt[]; allocation: AllocationOverview }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<GoalView | null>(null);
  const [order, setOrder] = useState<string[]>(() => goals.map((g) => g.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const idx = new Map(order.map((id, i) => [id, i]));
  const byOrder = (arr: GoalView[]) => [...arr].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
  const saveUps = byOrder(goals.filter((g) => g.type === 'save_up'));
  const payDowns = byOrder(goals.filter((g) => g.type === 'pay_down'));
  const totalSaved = saveUps.reduce((s, g) => s + g.current, 0);
  const totalDebt = payDowns.reduce((s, g) => s + g.current, 0);

  function persistOrder(ids: string[]) {
    void Promise.all(
      ids.map((id, i) =>
        fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sortOrder: i }) }),
      ),
    );
  }
  function reorder(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    setOrder((cur) => {
      const next = cur.filter((x) => x !== dragId);
      const ti = next.indexOf(targetId);
      if (ti < 0) return cur;
      next.splice(ti, 0, dragId);
      persistOrder(next);
      return next;
    });
  }
  const dndFor = (g: GoalView): Dnd => ({
    dragging: draggingId === g.id,
    dropTarget: dropId === g.id && draggingId !== g.id,
    onDragStart: () => setDraggingId(g.id),
    onDragOver: (e) => { e.preventDefault(); if (draggingId && draggingId !== g.id) setDropId(g.id); },
    onDrop: () => { if (draggingId) reorder(draggingId, g.id); setDraggingId(null); setDropId(null); },
    onDragEnd: () => { setDraggingId(null); setDropId(null); },
  });

  async function del(g: GoalView) {
    if (!confirm(`Delete the goal "${g.name}"? (Your accounts and balances are untouched.)`)) return;
    const res = await fetch(`/api/goals/${g.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else alert('Could not delete goal.');
  }

  return (
    <>
      <PageHeader
        title="Goals"
        actions={
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90">
            + New goal
          </button>
        }
      />

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold mb-1">No goals yet</h2>
          <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90">
            + Create your first goal
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatTile size="lg" label="Saved toward goals" value={fmtMoney0(totalSaved)} tone="pos" sub={`${saveUps.length} save-up goal${saveUps.length === 1 ? '' : 's'}`} />
            <StatTile size="lg" label="Debt in payoff" value={fmtMoney0(totalDebt)} tone={totalDebt > 0 ? 'neg' : 'default'} sub={`${payDowns.length} pay-down goal${payDowns.length === 1 ? '' : 's'}`} />
            <StatTile size="lg" label="Goals" value={String(goals.length)} sub="Active" />
          </div>

          {allocation.hasAllocations && <AllocationCard a={allocation} />}

          {saveUps.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[14px] font-semibold mb-3">Save up</h2>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {saveUps.map((g) => <GoalCard key={g.id} g={g} dnd={dndFor(g)} onEdit={() => setEditing(g)} onDelete={() => del(g)} />)}
              </div>
            </div>
          )}

          {payDowns.length > 0 && (
            <div>
              <h2 className="text-[14px] font-semibold mb-3">Pay down debt</h2>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {payDowns.map((g) => <GoalCard key={g.id} g={g} dnd={dndFor(g)} onEdit={() => setEditing(g)} onDelete={() => del(g)} />)}
              </div>
            </div>
          )}
        </>
      )}

      {debts.length > 0 && (
        <div className="mt-8">
          <DebtPayoffPlan debts={debts} />
        </div>
      )}

      {adding && <GoalForm accountOptions={accountOptions} onClose={() => setAdding(false)} />}
      {editing && <GoalForm goal={editing} accountOptions={accountOptions} onClose={() => setEditing(null)} />}
    </>
  );
}
