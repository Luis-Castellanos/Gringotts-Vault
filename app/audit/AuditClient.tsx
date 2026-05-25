'use client';

import { useEffect, useState } from 'react';

import type { AccountAudit, ChainAudit, StatementAudit, StmtAudit, StmtStatus } from '@/lib/audit/load';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney, fmtMoney0, fmtDate } from '@/lib/format';

const STATUS: Record<StmtStatus, { dot: string; label: string; cls: string }> = {
  ok: { dot: 'bg-positive', label: 'Reconciles', cls: 'text-positive' },
  discrepancy: { dot: 'bg-negative', label: 'Discrepancy', cls: 'text-negative' },
  no_stated: { dot: 'bg-text-muted', label: 'No stated totals', cls: 'text-text-muted' },
};

function DeltaBadge({ label, delta }: { label: string; delta: number }) {
  return (
    <span className="rounded-md bg-negative/10 text-negative text-[11px] font-medium px-1.5 py-0.5 tabular-nums">
      {label} {fmtMoney(delta, { sign: true })}
    </span>
  );
}

function ChainView({ importId }: { importId: string }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; chain: ChainAudit }>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch(`/api/audit/${importId}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setState(j?.data ? { kind: 'ok', chain: j.data } : { kind: 'error' }); })
      .catch(() => { if (alive) setState({ kind: 'error' }); });
    return () => { alive = false; };
  }, [importId]);

  if (state.kind === 'loading') {
    return <div className="px-4 py-6 text-[12.5px] text-text-tertiary">Loading transactions…</div>;
  }
  if (state.kind === 'error') {
    return <div className="px-4 py-6 text-[12.5px] text-negative">Could not load this statement’s transactions.</div>;
  }

  const { chain } = state;
  if (chain.rows.length === 0) {
    return <div className="px-4 py-6 text-[12.5px] text-text-tertiary">No transactions linked to this statement.</div>;
  }
  if (!chain.hasPrintedBalances) {
    return (
      <div className="px-4 py-4 text-[12.5px] text-text-tertiary">
        This statement’s rows carry no printed running balance (typical for credit cards), so a row-by-row balance chain
        isn’t available. Reconciliation uses the stated credit/debit totals above.
      </div>
    );
  }

  return (
    <div className="px-1 pb-2">
      <div className="px-3 py-2 text-[12px] text-text-tertiary">
        {chain.reconcilesAtEnd ? (
          <span>
            <span className="text-positive font-medium">Balances reconcile at period end.</span> Highlighted rows reflect
            intra-day ordering — the printed balance catches up by the next day.
          </span>
        ) : chain.firstBreakIndex != null ? (
          <span>
            <span className="text-negative font-medium">Chain breaks at row {chain.firstBreakIndex + 1}.</span> From there the
            printed balance and the running sum of amounts diverge — the likely spot where a row was dropped or mis-parsed.
          </span>
        ) : (
          <span>Row-by-row running balance vs. the expected balance (beginning balance + cumulative amounts).</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-[0.06em] text-text-muted text-left">
              <th className="font-medium px-3 py-1.5">Date</th>
              <th className="font-medium px-3 py-1.5">Description</th>
              <th className="font-medium px-3 py-1.5 text-right">Amount</th>
              <th className="font-medium px-3 py-1.5 text-right">Printed bal.</th>
              <th className="font-medium px-3 py-1.5 text-right">Expected</th>
              <th className="font-medium px-3 py-1.5 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {chain.rows.map((r, i) => (
              <tr
                key={r.id}
                className={`border-t border-border-subtle ${r.broken ? 'bg-negative/[0.06]' : ''} ${
                  chain.firstBreakIndex === i ? 'ring-1 ring-inset ring-negative/40' : ''
                }`}
              >
                <td className="px-3 py-1.5 text-text-tertiary whitespace-nowrap">{fmtDate(r.date, { day: true })}</td>
                <td className="px-3 py-1.5 text-text-secondary max-w-[320px] truncate" title={r.description}>
                  {r.merchant || r.description}
                </td>
                <td className={`px-3 py-1.5 text-right ${r.amount < 0 ? 'text-negative' : 'text-positive'}`}>
                  {fmtMoney(r.amount, { sign: true })}
                </td>
                <td className="px-3 py-1.5 text-right text-text-primary">{r.printedBalance != null ? fmtMoney(r.printedBalance) : '—'}</td>
                <td className="px-3 py-1.5 text-right text-text-tertiary">{r.expectedBalance != null ? fmtMoney(r.expectedBalance) : '—'}</td>
                <td className={`px-3 py-1.5 text-right ${r.broken ? 'text-negative font-medium' : 'text-text-muted'}`}>
                  {r.delta != null && r.broken ? fmtMoney(r.delta, { sign: true }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementRow({ stmt }: { stmt: StmtAudit }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[stmt.status];
  const hasDelta =
    (stmt.endDelta != null && Math.abs(stmt.endDelta) > 0.01) ||
    (stmt.creditsDelta != null && Math.abs(stmt.creditsDelta) > 0.01) ||
    (stmt.debitsDelta != null && Math.abs(stmt.debitsDelta) > 0.01);

  return (
    <div>
      {stmt.gapDaysBefore != null && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] text-amber-400">
          <span className="h-px flex-1 bg-amber-400/30" />
          {stmt.gapDaysBefore} day{stmt.gapDaysBefore === 1 ? '' : 's'} uncovered before this statement
          <span className="h-px flex-1 bg-amber-400/30" />
        </div>
      )}
      {stmt.overlapBefore && (
        <div className="px-3 py-1 text-[11.5px] text-text-muted">Overlaps the previous statement’s period.</div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors text-left"
      >
        <span className={`size-2 rounded-full shrink-0 ${st.dot}`} title={st.label} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] text-text-primary truncate">{stmt.periodLabel}</div>
          <div className="text-[11.5px] text-text-tertiary">{stmt.n} transaction{stmt.n === 1 ? '' : 's'}</div>
        </div>
        <div className="hidden sm:block text-[12.5px] tabular-nums text-text-tertiary whitespace-nowrap">
          {stmt.begin != null ? fmtMoney0(stmt.begin) : '—'} → {stmt.finish != null ? fmtMoney0(stmt.finish) : '—'}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 min-w-[120px] justify-end">
          {hasDelta ? (
            <>
              {stmt.endDelta != null && Math.abs(stmt.endDelta) > 0.01 && <DeltaBadge label="end" delta={stmt.endDelta} />}
              {stmt.creditsDelta != null && Math.abs(stmt.creditsDelta) > 0.01 && <DeltaBadge label="dep" delta={stmt.creditsDelta} />}
              {stmt.debitsDelta != null && Math.abs(stmt.debitsDelta) > 0.01 && <DeltaBadge label="wd" delta={stmt.debitsDelta} />}
            </>
          ) : (
            <span className={`text-[11.5px] ${st.cls}`}>{st.label}</span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="ml-5 mb-2 rounded-lg border border-border-subtle bg-surface-base/40">
          <ChainView importId={stmt.id} />
        </div>
      )}
    </div>
  );
}

function CoverageStrip({ statements }: { statements: StmtAudit[] }) {
  return (
    <div className="flex items-center gap-0.5 mb-3" title="Coverage timeline — each segment is a statement">
      {statements.map((s) => (
        <span key={s.id} className="contents">
          {s.gapDaysBefore != null && <span className="w-1.5 h-2.5 bg-amber-400/40 rounded-sm shrink-0" title={`${s.gapDaysBefore} days uncovered`} />}
          <span
            className={`h-2.5 flex-1 min-w-[3px] rounded-sm ${
              s.status === 'ok' ? 'bg-positive/70' : s.status === 'discrepancy' ? 'bg-negative/70' : 'bg-text-muted/40'
            }`}
            title={`${s.periodLabel} · ${STATUS[s.status].label}`}
          />
        </span>
      ))}
    </div>
  );
}

function AccountCard({ acct }: { acct: AccountAudit }) {
  return (
    <section className="rounded-2xl bg-surface-1 border border-border-subtle p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-[15px] font-semibold">{acct.accountName}</h2>
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className="text-text-tertiary">{acct.statements.length} statement{acct.statements.length === 1 ? '' : 's'}</span>
          {acct.badCount > 0 && <span className="rounded-md bg-negative/10 text-negative px-2 py-0.5 font-medium">{acct.badCount} discrepanc{acct.badCount === 1 ? 'y' : 'ies'}</span>}
          {acct.gapCount > 0 && <span className="rounded-md bg-amber-400/10 text-amber-400 px-2 py-0.5 font-medium">{acct.gapCount} gap{acct.gapCount === 1 ? '' : 's'}</span>}
          {acct.badCount === 0 && acct.gapCount === 0 && acct.noStatedCount < acct.statements.length && (
            <span className="rounded-md bg-positive/10 text-positive px-2 py-0.5 font-medium">All reconcile</span>
          )}
        </div>
      </div>
      <CoverageStrip statements={acct.statements} />
      <div className="flex flex-col divide-y divide-border-subtle/60">
        {acct.statements.map((s) => <StatementRow key={s.id} stmt={s} />)}
      </div>
    </section>
  );
}

export function AuditClient({ data }: { data: StatementAudit }) {
  const { accounts, summary } = data;

  return (
    <>
      <PageHeader title="Statement Audit" subtitle="Are all your statements loaded, and do they add up?" />

      {summary.totalStatements === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-20 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-muted">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold mb-1">No statements imported yet</h2>
          <p className="text-[13px] text-text-tertiary max-w-md mx-auto">
            Upload bank or card statements and this page reconciles each one’s stated totals against the parsed rows, and
            flags coverage gaps.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatTile label="Statements" value={String(summary.totalStatements)} sub={`${summary.accountCount} account${summary.accountCount === 1 ? '' : 's'}`} />
            <StatTile label="Reconciled" value={String(summary.reconOk)} tone="pos" sub={summary.noStated > 0 ? `${summary.noStated} without stated totals` : 'Stated = derived'} />
            <StatTile label="Discrepancies" value={String(summary.reconBad)} tone={summary.reconBad > 0 ? 'neg' : 'default'} sub="Stated ≠ derived" />
            <StatTile label="Coverage gaps" value={String(summary.gaps)} tone={summary.gaps > 0 ? 'neg' : 'default'} sub="Uncovered periods" />
          </div>

          {accounts.map((a) => <AccountCard key={a.accountId ?? a.accountName} acct={a} />)}

          <p className="text-[12px] text-text-muted mt-2 leading-relaxed">
            Reconciliation compares each statement’s PDF-stated control totals (beginning/ending balance, deposit/withdrawal
            totals) against the figures derived from the parsed rows. Credit-card statements often don’t print a running
            balance, so they show “no stated totals.”
          </p>
        </>
      )}
    </>
  );
}
