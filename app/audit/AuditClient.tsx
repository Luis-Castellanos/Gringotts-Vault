'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtDate, fmtMoney, fmtMoney0 } from '@/lib/format';
import type { AccountAudit, StatementAudit, StmtAudit, StmtStatus } from '@/lib/audit/load';

const STATUS: Record<StmtStatus, { label: string; dot: string; tone: string; border: string }> = {
  ok: {
    label: 'Reconciled',
    dot: 'bg-positive',
    tone: 'text-positive',
    border: 'border-positive/35 hover:border-positive/60',
  },
  discrepancy: {
    label: 'Difference',
    dot: 'bg-negative',
    tone: 'text-negative',
    border: 'border-negative/35 hover:border-negative/65',
  },
  no_stated: {
    label: 'Missing totals',
    dot: 'bg-text-muted',
    tone: 'text-text-muted',
    border: 'border-border-subtle hover:border-border-strong',
  },
};

function absDiffs(stmt: StmtAudit): number {
  return [stmt.endDelta, stmt.creditsDelta, stmt.debitsDelta]
    .filter((d): d is number => d != null)
    .reduce((sum, d) => sum + Math.abs(d), 0);
}

function StatementCard({ stmt }: { stmt: StmtAudit }) {
  const status = STATUS[stmt.status];
  const period = stmt.start && stmt.end ? `${fmtDate(stmt.start, { day: true })} - ${fmtDate(stmt.end, { day: true })}` : stmt.periodLabel;
  const delta = absDiffs(stmt);

  return (
    <Link
      href={`/audit/${stmt.id}`}
      className={`group flex h-[188px] w-[196px] shrink-0 flex-col justify-between rounded-2xl border bg-surface-1 p-4 shadow-[var(--shadow-card)] transition ${status.border}`}
    >
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${status.tone} bg-surface-2`}>
            <span className={`size-2 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="text-[11px] text-text-muted tabular-nums">{stmt.n} tx</span>
        </div>
        <div className="text-[14px] font-semibold leading-tight text-text-primary">{stmt.periodLabel}</div>
        <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-text-tertiary">{period}</div>
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl bg-surface-2 px-2.5 py-2">
            <div className="text-text-muted">Begin</div>
            <div className="numeric mt-0.5 font-semibold text-text-primary">{fmtMoney0(stmt.begin)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-2.5 py-2">
            <div className="text-text-muted">End</div>
            <div className="numeric mt-0.5 font-semibold text-text-primary">{fmtMoney0(stmt.finish)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11.5px]">
          <span className="text-positive">{stmt.inflowCount} in · {fmtMoney0(stmt.parsedInflow)}</span>
          <span className="text-negative">{stmt.outflowCount} out · {fmtMoney0(stmt.parsedOutflow)}</span>
        </div>
        <div className={`text-[11.5px] font-medium ${stmt.status === 'discrepancy' ? 'text-negative' : 'text-text-muted'}`}>
          {stmt.status === 'discrepancy' ? `Off by ${fmtMoney(delta)}` : stmt.sourceFile ?? 'Statement'}
        </div>
      </div>
    </Link>
  );
}

function AccountRail({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: AccountAudit[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1 p-2 shadow-[var(--shadow-card)] lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto">
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Accounts</div>
      <div className="grid gap-1">
        {accounts.map((account) => {
          const id = account.accountId ?? account.accountName;
          const active = id === selectedId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`rounded-xl px-3 py-3 text-left transition ${
                active ? 'bg-accent-soft text-text-primary shadow-[inset_0_0_0_1px_var(--color-accent-border)]' : 'text-text-secondary hover:bg-surface-2'
              }`}
            >
              <div className="truncate text-[13px] font-semibold">{account.accountName}</div>
              <div className="mt-1 flex items-center gap-2 text-[11.5px] text-text-tertiary">
                <span>{account.statements.length} statements</span>
                {account.badCount > 0 && <span className="text-negative">{account.badCount} off</span>}
                {account.gapCount > 0 && <span className="text-amber-400">{account.gapCount} gaps</span>}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Timeline({ account }: { account: AccountAudit }) {
  const statements = account.statements;
  return (
    <section className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1 p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-text-primary">{account.accountName}</h2>
          <div className="mt-1 text-[12px] text-text-tertiary">
            {account.okCount} reconciled · {account.badCount} differences · {account.noStatedCount} missing stated totals
          </div>
        </div>
        <div className="hidden items-center gap-3 text-[11px] text-text-tertiary sm:flex">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-positive" /> Reconciled</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-negative" /> Difference</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-text-muted" /> Missing totals</span>
        </div>
      </div>

      {statements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle px-6 py-16 text-center text-[13px] text-text-tertiary">
          No statements for this account.
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-2">
          <div className="grid auto-cols-[196px] grid-flow-col gap-4">
            {statements.map((stmt) => <StatementCard key={stmt.id} stmt={stmt} />)}
          </div>
        </div>
      )}
    </section>
  );
}

export function AuditClient({ data }: { data: StatementAudit }) {
  const accounts = data.accounts;
  const [selectedId, setSelectedId] = useState(accounts[0]?.accountId ?? accounts[0]?.accountName ?? '');
  const selected = useMemo(
    () => accounts.find((account) => (account.accountId ?? account.accountName) === selectedId) ?? accounts[0],
    [accounts, selectedId],
  );

  return (
    <>
      <PageHeader title="Audit" />

      {data.summary.totalStatements === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <h2 className="text-[16px] font-semibold">No statements imported yet</h2>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile label="Statements" value={String(data.summary.totalStatements)} sub={`${data.summary.accountCount} accounts`} />
            <StatTile label="Reconciled" value={String(data.summary.reconOk)} tone="pos" sub="Statement = ledger" />
            <StatTile label="Differences" value={String(data.summary.reconBad)} tone={data.summary.reconBad > 0 ? 'neg' : 'default'} sub="Needs review" />
            <StatTile label="Coverage gaps" value={String(data.summary.gaps)} tone={data.summary.gaps > 0 ? 'neg' : 'default'} sub="Missing periods" />
          </div>

          <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
            <AccountRail accounts={accounts} selectedId={selectedId} onSelect={setSelectedId} />
            {selected && <Timeline account={selected} />}
          </div>
        </>
      )}
    </>
  );
}
