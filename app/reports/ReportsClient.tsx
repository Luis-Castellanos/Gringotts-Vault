'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AnnualReport, ReportCategory } from '@/lib/reports/load';
import type { RecurringReport, Cadence } from '@/lib/reports/recurring';
import type { AnomalyReport } from '@/lib/reports/anomalies';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0, fmtDate } from '@/lib/format';
import { CustomPanel } from './CustomPanel';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

type Tab = 'summary' | 'recurring' | 'anomalies' | 'custom';

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

function SummaryPanel({ report, prev }: { report: AnnualReport; prev: AnnualReport | null }) {
  const py = report.year - 1;
  const yoy = (cur: number, was: number | undefined): string | undefined => {
    if (was == null || was === 0) return undefined;
    const d = ((cur - was) / Math.abs(was)) * 100;
    return `${d >= 0 ? '+' : ''}${d.toFixed(0)}% vs ${py}`;
  };
  const savingsDelta = prev?.savingsRate != null && report.savingsRate != null ? report.savingsRate - prev.savingsRate : null;
  return (
    <>
      {/* Headline */}
      <p className="text-[14px] text-text-secondary mb-5 leading-relaxed">
        In <span className="font-semibold text-text-primary">{report.year}</span> you {report.net >= 0 ? 'saved' : 'spent a net'}{' '}
        <span className={`font-semibold ${report.net >= 0 ? 'text-positive' : 'text-negative'}`}>{money0(Math.abs(report.net))}</span>
        {report.savingsRate != null && <> — a <span className="font-semibold text-text-primary">{report.savingsRate}%</span> savings rate</>}
        {savingsDelta != null && (
          <span className="text-text-tertiary">{' '}({savingsDelta >= 0 ? '+' : ''}{savingsDelta} pts vs {py})</span>
        )}.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatTile label="Income" value={money0(report.income)} tone="blue" sub={yoy(report.income, prev?.income)} />
        <StatTile label="Spending" value={money0(report.spending)} tone="neg" sub={yoy(report.spending, prev?.spending)} />
        <StatTile label="Net" value={money0(report.net)} tone={report.net >= 0 ? 'pos' : 'neg'} sub={yoy(report.net, prev?.net)} />
        <StatTile label="Savings rate" value={report.savingsRate != null ? `${report.savingsRate}%` : '—'} sub={prev?.savingsRate != null ? `was ${prev.savingsRate}%` : undefined} />
      </div>
      <div className="mb-5">
        <MonthlyChart report={report} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Breakdown title="Income by source" cats={report.incomeByCategory} tone="pos" />
        <Breakdown title="Spending by category" cats={report.spendingByCategory} tone="neg" />
      </div>
    </>
  );
}

function RecurringPanel({ data }: { data: RecurringReport }) {
  const [showInactive, setShowInactive] = useState(false);
  const shown = showInactive ? data.charges : data.charges.filter((c) => c.active);
  const inactiveCount = data.charges.length - data.charges.filter((c) => c.active).length;

  if (data.charges.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
        No recurring charges detected yet. Vault flags merchants billed on a steady cadence once there are a few cycles of history.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <StatTile size="lg" label="Monthly recurring" value={money0(data.monthlyTotal)} tone="neg" sub={`${data.activeCount} active subscription${data.activeCount === 1 ? '' : 's'}`} />
        <StatTile size="lg" label="Yearly equivalent" value={money0(data.yearlyTotal)} sub="At current cadence" />
        <StatTile size="lg" label="Detected" value={String(data.charges.length)} sub={inactiveCount > 0 ? `${inactiveCount} possibly canceled` : 'All active'} />
      </div>

      <section className="rounded-xl bg-surface-1 border border-border-subtle overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="text-[14px] font-semibold">Recurring charges</h2>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-[12.5px] text-text-secondary cursor-pointer select-none">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-accent-500" />
              Show possibly canceled ({inactiveCount})
            </label>
          )}
        </div>
        <div className="divide-y divide-border-subtle">
          {shown.map((c) => (
            <div key={c.merchant} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-text-primary truncate">{c.merchant}</span>
                  {!c.active && <span className="text-[10.5px] rounded bg-surface-2 text-text-muted px-1.5 py-0.5 shrink-0">canceled?</span>}
                </div>
                <div className="text-[12px] text-text-tertiary">
                  {CADENCE_LABEL[c.cadence]} · {c.count}× · {c.category ?? 'Uncategorized'}
                  {c.active && <> · next ~{fmtDate(c.nextExpected, { day: true })}</>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[14px] font-semibold tabular-nums">{money0(c.typicalAmount)}</div>
                <div className="text-[11.5px] text-text-tertiary tabular-nums">{money0(c.monthlyEquivalent)}/mo</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <p className="text-[12px] text-text-muted mt-4 leading-relaxed">
        Heuristic — Vault infers cadence from the spacing of charges per merchant. “Monthly equivalent” normalizes each charge
        to a per-month figure so weekly and yearly bills compare fairly.
      </p>
    </>
  );
}

function AnomaliesPanel({ data }: { data: AnomalyReport }) {
  if (data.anomalies.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
        Nothing unusual in {data.monthLabel ?? 'the latest month'} — every category is in line with its recent average.
      </div>
    );
  }
  return (
    <>
      <p className="text-[13px] text-text-tertiary mb-4">
        Categories running above their trailing {data.baselineMonths}-month average in <span className="text-text-secondary font-medium">{data.monthLabel}</span>. Informational — no budgets, just a heads-up.
      </p>
      <div className="flex flex-col gap-2.5">
        {data.anomalies.map((a) => (
          <div key={a.categoryId} className="flex items-center gap-4 rounded-xl bg-surface-1 border border-border-subtle px-5 py-3.5">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: a.color ?? 'var(--color-negative)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-text-primary truncate">{a.name}</div>
              <div className="text-[12px] text-text-tertiary">
                {a.isNew ? 'New this month — no recent history' : `Usually ~${money0(a.baseline)}/mo`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[15px] font-semibold tabular-nums text-negative">{money0(a.current)}</div>
              <div className="text-[11.5px] text-text-tertiary tabular-nums">
                {a.isNew ? 'new' : `${a.ratio.toFixed(1)}× · +${money0(a.delta)}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'custom', label: 'Custom' },
];

export function ReportsClient({
  years,
  report,
  prevReport,
  recurring,
  anomalies,
}: {
  years: number[];
  report: AnnualReport;
  prevReport: AnnualReport | null;
  recurring: RecurringReport;
  anomalies: AnomalyReport;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Income, spending, recurring charges, and anomalies."
        actions={
          tab === 'summary' ? (
            <>
              <select
                className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
                value={report.year}
                onChange={(e) => router.push(`/reports?year=${e.target.value}`)}
                aria-label="Report year"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <a
                href={`/api/export/transactions?from=${report.year}-01-01&to=${report.year}-12-31`}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2"
              >
                Export {report.year} ↓
              </a>
            </>
          ) : undefined
        }
      />

      <div className="flex items-center gap-1 mb-6 border-b border-border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 text-[13px] font-medium -mb-px border-b-2 transition-colors ${
              tab === t.id ? 'border-accent-500 text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t.label}
            {t.id === 'recurring' && recurring.activeCount > 0 && <span className="ml-1.5 text-[11px] text-text-muted tabular-nums">{recurring.activeCount}</span>}
            {t.id === 'anomalies' && anomalies.anomalies.length > 0 && <span className="ml-1.5 text-[11px] rounded bg-negative/15 text-negative px-1.5 py-0.5 tabular-nums">{anomalies.anomalies.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'summary' && <SummaryPanel report={report} prev={prevReport} />}
      {tab === 'recurring' && <RecurringPanel data={recurring} />}
      {tab === 'anomalies' && <AnomaliesPanel data={anomalies} />}
      {tab === 'custom' && <CustomPanel />}
    </>
  );
}
