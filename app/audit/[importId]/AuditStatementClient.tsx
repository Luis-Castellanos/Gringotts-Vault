'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ChainAudit, ChainRow } from '@/lib/audit/load';
import { fmtDate, fmtMoney, fmtMoney0 } from '@/lib/format';

type Filter = 'all' | 'inflows' | 'outflows' | 'differences';

function Delta({ value }: { value: number | null }) {
  const bad = value != null && Math.abs(value) > 0.01;
  return <span className={`numeric text-[12px] font-semibold ${bad ? 'text-negative' : 'text-positive'}`}>{value == null ? '—' : fmtMoney(value, { sign: true })}</span>;
}

function ReconcileCard({
  label,
  statement,
  calculated,
  delta,
}: {
  label: string;
  statement: number | null;
  calculated: number | null;
  delta: number | null;
}) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-1 p-4 shadow-[var(--shadow-card)]">
      <div className="ui-label mb-3">{label}</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[11px] text-text-muted">Statement</div>
          <div className="numeric mt-1 text-[18px] font-semibold text-text-primary">{fmtMoney(statement)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted">Calculated</div>
          <div className="numeric mt-1 text-[18px] font-semibold text-text-primary">{fmtMoney(calculated)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted">Diff</div>
          <div className="mt-1"><Delta value={delta} /></div>
        </div>
      </div>
    </section>
  );
}

function rowMatches(row: ChainRow, filter: Filter) {
  if (filter === 'inflows') return row.amount > 0;
  if (filter === 'outflows') return row.amount < 0;
  if (filter === 'differences') return row.broken;
  return true;
}

export function AuditStatementClient({ chain }: { chain: ChainAudit }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => chain.rows.filter((row) => rowMatches(row, filter)), [chain.rows, filter]);
  const hasAnyDelta =
    [chain.endDelta, chain.creditsDelta, chain.debitsDelta].some((d) => d != null && Math.abs(d) > 0.01) ||
    chain.rows.some((row) => row.broken);
  const rangeHref = `/transactions?from=${chain.rows[0]?.date ?? ''}&to=${chain.rows.at(-1)?.date ?? ''}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/audit" className="rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-semibold text-text-secondary hover:bg-surface-2">
          Back to Audit
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-semibold text-text-secondary hover:bg-surface-2"
          >
            Reconcile
          </button>
          <Link href={rangeHref} className="rounded-lg bg-accent-500 px-3 py-2 text-[13px] font-semibold text-[var(--color-accent-contrast)] hover:brightness-110">
            Open transactions
          </Link>
          {chain.documentId && (
            <Link href={`/api/documents/${chain.documentId}`} target="_blank" className="rounded-lg border border-border-subtle px-3 py-2 text-[13px] font-semibold text-text-secondary hover:bg-surface-2">
              Statement file
            </Link>
          )}
        </div>
      </div>

      <section className="mb-5 rounded-2xl border border-border-subtle bg-surface-1 p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-label mb-2">Statement</div>
            <h1 className="text-[22px] font-semibold tracking-[0] text-text-primary">{chain.periodLabel}</h1>
            <div className="mt-1 text-[13px] text-text-tertiary">{chain.accountName}{chain.sourceFile ? ` · ${chain.sourceFile}` : ''}</div>
          </div>
          <div className={`rounded-2xl px-4 py-3 text-right ${hasAnyDelta ? 'bg-negative/10 text-negative' : 'bg-positive/10 text-positive'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em]">{hasAnyDelta ? 'Needs review' : 'Reconciled'}</div>
            <div className="numeric mt-1 text-[20px] font-semibold">{fmtMoney0(chain.derivedEnd)}</div>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-4 xl:grid-cols-3">
        <ReconcileCard label="Ending balance" statement={chain.finish} calculated={chain.derivedEnd} delta={chain.endDelta} />
        <ReconcileCard label={`${chain.inflowCount} inflows`} statement={chain.statedCredits} calculated={chain.parsedInflow} delta={chain.creditsDelta} />
        <ReconcileCard label={`${chain.outflowCount} outflows`} statement={chain.statedDebits} calculated={chain.parsedOutflow} delta={chain.debitsDelta} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border-subtle bg-surface-1 p-1">
          {(['all', 'inflows', 'outflows', 'differences'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition ${filter === f ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-text-tertiary">{rows.length} of {chain.rows.length} linked transactions</div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-[0.07em] text-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Transaction</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Printed bal.</th>
                <th className="px-4 py-3 text-right font-semibold">Calculated</th>
                <th className="px-4 py-3 text-right font-semibold">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={`border-t border-border-subtle ${row.broken ? 'bg-negative/[0.06]' : ''}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-text-tertiary">{fmtDate(row.date, { day: true })}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-[420px] truncate font-medium text-text-primary" title={row.description}>{row.merchant || row.description}</div>
                    {row.merchant && <div className="mt-0.5 max-w-[420px] truncate text-[11.5px] text-text-muted">{row.description}</div>}
                  </td>
                  <td className={`numeric whitespace-nowrap px-4 py-3 text-right font-semibold ${row.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {fmtMoney(row.amount, { sign: true })}
                  </td>
                  <td className="numeric whitespace-nowrap px-4 py-3 text-right text-text-primary">{fmtMoney(row.printedBalance)}</td>
                  <td className="numeric whitespace-nowrap px-4 py-3 text-right text-text-tertiary">{fmtMoney(row.expectedBalance)}</td>
                  <td className="numeric whitespace-nowrap px-4 py-3 text-right"><Delta value={row.delta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
