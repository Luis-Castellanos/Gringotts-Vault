'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { AnnualReport, ReportCategory } from '@/lib/reports/load';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0 } from '@/lib/format';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function Breakdown({ title, cats, tone }: { title: string; cats: ReportCategory[]; tone: 'pos' | 'neg' }) {
  const max = cats.length ? Math.max(...cats.map((c) => c.amount)) : 1;
  const barColor = tone === 'pos' ? 'var(--color-positive)' : 'var(--color-negative)';
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <h2 className="text-[14px] font-semibold mb-4">{title}</h2>
      {cats.length === 0 ? (
        <p className="text-[13px] text-text-tertiary py-3">Nothing recorded.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {cats.slice(0, 10).map((c) => (
            <div key={c.id} className="relative rounded-lg overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-lg opacity-[0.14]" style={{ width: `${(c.amount / max) * 100}%`, background: c.color ?? barColor }} />
              <div className="relative flex justify-between px-3 py-2 text-[13px]">
                <span className="truncate text-text-secondary">{c.name}</span>
                <span className="tabular-nums text-text-primary ml-2">{money0(c.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MonthlyChart({ report }: { report: AnnualReport }) {
  const max = Math.max(1, ...report.months.flatMap((m) => [m.income, m.spending]));
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold">Monthly income vs spending</h2>
        <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-cat-blue" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-negative" /> Spending</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 h-40">
        {report.months.map((m) => (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="flex items-end gap-0.5 h-32 w-full justify-center">
              <div className="w-2.5 rounded-t bg-cat-blue" style={{ height: `${(m.income / max) * 100}%` }} title={`Income ${money0(m.income)}`} />
              <div className="w-2.5 rounded-t bg-negative" style={{ height: `${(m.spending / max) * 100}%` }} title={`Spending ${money0(m.spending)}`} />
            </div>
            <span className="text-[10px] text-text-muted">{MONTHS[m.month - 1]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReportsClient({ years, report }: { years: number[]; report: AnnualReport }) {
  const router = useRouter();
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Year-end summary — income, spending, and where it went."
        actions={
          <>
            <select
              className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
              value={report.year}
              onChange={(e) => router.push(`/reports?year=${e.target.value}`)}
              aria-label="Report year"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Link href="/settings" className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">
              Export →
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatTile label="Income" value={money0(report.income)} tone="blue" />
        <StatTile label="Spending" value={money0(report.spending)} tone="neg" />
        <StatTile label="Net" value={money0(report.net)} tone={report.net >= 0 ? 'pos' : 'neg'} />
        <StatTile label="Savings rate" value={report.savingsRate != null ? `${report.savingsRate}%` : '—'} />
      </div>

      <div className="mb-5">
        <MonthlyChart report={report} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Breakdown title="Income by source" cats={report.incomeByCategory} tone="pos" />
        <Breakdown title="Spending by category" cats={report.spendingByCategory} tone="neg" />
      </div>

      <p className="text-[12px] text-text-muted mt-6">
        More report types — saved/custom queries, subscriptions, anomalies — are on the roadmap.
      </p>
    </>
  );
}
