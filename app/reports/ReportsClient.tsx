'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

import Link from 'next/link';

import type { AnnualReport, ReportCategory, TopMerchant } from '@/lib/reports/load';
import type { RecurringReport, Cadence } from '@/lib/reports/recurring';
import type { AnomalyReport } from '@/lib/reports/anomalies';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { CategoryIcon } from '@/components/CategoryIcon';
import { fmtMoney0 as money0, fmtDate } from '@/lib/format';
import { CustomPanel } from './CustomPanel';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

type Tab = 'summary' | 'compare' | 'recurring' | 'anomalies' | 'custom';

type CmpRow = { id: string; name: string; color: string | null; cur: number; prev: number };
function mergeCats(cur: ReportCategory[], prev: ReportCategory[]): CmpRow[] {
  const m = new Map<string, CmpRow>();
  for (const c of cur) m.set(c.id, { id: c.id, name: c.name, color: c.color, cur: c.amount, prev: 0 });
  for (const c of prev) {
    const e = m.get(c.id);
    if (e) e.prev = c.amount;
    else m.set(c.id, { id: c.id, name: c.name, color: c.color, cur: 0, prev: c.amount });
  }
  return [...m.values()].sort((a, b) => b.cur + b.prev - (a.cur + a.prev));
}

function ComparePanel({ report, prev }: { report: AnnualReport; prev: AnnualReport }) {
  const py = prev.year;
  const cy = report.year;
  const metric = (label: string, cur: number, was: number, kind: 'pos' | 'neg' | 'net') => {
    const d = cur - was;
    const goodUp = kind !== 'neg'; // for spending, down is good
    const good = kind === 'net' ? d >= 0 : goodUp ? d >= 0 : d <= 0;
    return (
      <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[18px] font-semibold tabular-nums">{money0(cur)}</span>
          <span className="text-[12px] text-text-tertiary tabular-nums">from {money0(was)}</span>
        </div>
        <div className={`text-[12px] tabular-nums mt-0.5 ${good ? 'text-positive' : 'text-negative'}`}>
          {d >= 0 ? '+' : ''}{money0(d)}{was ? ` (${d >= 0 ? '+' : ''}${Math.round((d / Math.abs(was)) * 100)}%)` : ''}
        </div>
      </div>
    );
  };
  const Table = ({ title, rows }: { title: string; rows: CmpRow[] }) => (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <h2 className="text-[14px] font-semibold mb-3">{title}</h2>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-[13px] items-center">
        <div className="text-[11px] uppercase tracking-[0.05em] text-text-muted">Category</div>
        <div className="text-[11px] uppercase tracking-[0.05em] text-text-muted text-right tabular-nums">{py}</div>
        <div className="text-[11px] uppercase tracking-[0.05em] text-text-muted text-right tabular-nums">{cy}</div>
        <div className="text-[11px] uppercase tracking-[0.05em] text-text-muted text-right">Δ</div>
        {rows.slice(0, 16).map((r) => {
          const d = r.cur - r.prev;
          return (
            <Fragment key={r.id}>
              <span className="flex items-center gap-2 min-w-0"><CategoryIcon name={r.name} color={r.color} size={18} /><span className="truncate text-text-secondary">{r.name}</span></span>
              <span className="text-right tabular-nums text-text-tertiary">{money0(r.prev)}</span>
              <span className="text-right tabular-nums text-text-primary">{money0(r.cur)}</span>
              <span className={`text-right tabular-nums text-[12.5px] ${d >= 0 ? 'text-text-secondary' : 'text-positive'}`}>{d >= 0 ? '+' : ''}{money0(d)}</span>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
  return (
    <>
      <p className="text-[13px] text-text-tertiary mb-4"><span className="font-medium text-text-secondary">{cy}</span> vs <span className="font-medium text-text-secondary">{py}</span> — where things moved.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {metric('Income', report.income, prev.income, 'pos')}
        {metric('Spending', report.spending, prev.spending, 'neg')}
        {metric('Net', report.net, prev.net, 'net')}
        <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Savings rate</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[18px] font-semibold tabular-nums">{report.savingsRate ?? '—'}%</span>
            <span className="text-[12px] text-text-tertiary tabular-nums">from {prev.savingsRate ?? '—'}%</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Table title="Spending by category" rows={mergeCats(report.spendingByCategory, prev.spendingByCategory)} />
        <Table title="Income by source" rows={mergeCats(report.incomeByCategory, prev.incomeByCategory)} />
      </div>
    </>
  );
}

function Breakdown({ title, cats, tone, year }: { title: string; cats: ReportCategory[]; tone: 'pos' | 'neg'; year: number }) {
  const max = cats.length ? Math.max(...cats.map((c) => c.amount)) : 1;
  const barColor = tone === 'pos' ? 'var(--color-positive)' : 'var(--color-negative)';
  // Click a row → Transactions, filtered to that category for the year.
  const href = (id: string) =>
    `/transactions?cats=${encodeURIComponent(id === 'uncat' ? '__uncategorized__' : id)}&from=${year}-01-01&to=${year}-12-31`;
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <h2 className="text-[14px] font-semibold mb-4">{title}</h2>
      {cats.length === 0 ? (
        <p className="text-[13px] text-text-tertiary py-3">Nothing recorded.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {cats.slice(0, 10).map((c) => (
            <Link key={c.id} href={href(c.id)} className="relative rounded-lg overflow-hidden block group" title={`See ${c.name} transactions`}>
              <div className="absolute inset-y-0 left-0 rounded-lg opacity-[0.14] group-hover:opacity-[0.22] transition-opacity" style={{ width: `${(c.amount / max) * 100}%`, background: c.color ?? barColor }} />
              <div className="relative flex justify-between items-center gap-2 px-3 py-2 text-[13px]">
                <span className="flex items-center gap-2 min-w-0">
                  <CategoryIcon name={c.name} color={c.color} size={20} />
                  <span className="truncate text-text-secondary group-hover:text-text-primary transition-colors">{c.name}</span>
                </span>
                <span className="tabular-nums text-text-primary ml-2 shrink-0">{money0(c.amount)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MonthlyChart({ report, prev }: { report: AnnualReport; prev: AnnualReport | null }) {
  const py = report.year - 1;
  const max = Math.max(1, ...report.months.flatMap((m) => [m.income, m.spending]), ...(prev?.months.map((m) => m.spending) ?? []));
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-[14px] font-semibold">Monthly income vs spending</h2>
        <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-cat-blue" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-negative" /> Spending</span>
          {prev && <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-text-muted/40" /> {py} spend</span>}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 h-40">
        {report.months.map((m, i) => {
          const prevSpend = prev?.months[i]?.spending ?? null;
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                {prevSpend != null && (
                  <div className="w-1.5 rounded-t bg-text-muted/35" style={{ height: `${(prevSpend / max) * 100}%` }} title={`${py} spending ${money0(prevSpend)}`} />
                )}
                <div className="w-2.5 rounded-t bg-cat-blue" style={{ height: `${(m.income / max) * 100}%` }} title={`Income ${money0(m.income)}`} />
                <div className="w-2.5 rounded-t bg-negative" style={{ height: `${(m.spending / max) * 100}%` }} title={`Spending ${money0(m.spending)}`} />
              </div>
              <span className="text-[10px] text-text-muted">{MONTHS[m.month - 1]}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FlowBar({ title, total, segs }: { title: string; total: number; segs: { name: string; amount: number; color: string }[] }) {
  if (total <= 0 || segs.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-text-secondary">{title}</span>
        <span className="text-[12px] tabular-nums text-text-tertiary">{money0(total)}</span>
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-lg">
        {segs.map((s) => (
          <div
            key={s.name}
            className="h-full first:rounded-l-lg last:rounded-r-lg min-w-[2px]"
            style={{ width: `${(s.amount / total) * 100}%`, background: s.color }}
            title={`${s.name} · ${money0(s.amount)} (${Math.round((s.amount / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segs.slice(0, 8).map((s) => (
          <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span className="size-2 rounded-sm shrink-0" style={{ background: s.color }} />
            {s.name} <span className="tabular-nums text-text-muted">{Math.round((s.amount / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MoneyFlow({ report }: { report: AnnualReport }) {
  const incSegs = report.incomeByCategory.map((c) => ({ name: c.name, amount: c.amount, color: c.color ?? 'var(--color-cat-blue)' }));
  const outSegs = report.spendingByCategory.map((c) => ({ name: c.name, amount: c.amount, color: c.color ?? 'var(--color-negative)' }));
  const outTotal = report.spending + Math.max(0, report.net);
  if (report.net > 0) outSegs.push({ name: 'Saved', amount: report.net, color: 'var(--color-positive)' });
  if (report.income <= 0 && report.spending <= 0) return null;
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5 mb-5">
      <h2 className="text-[14px] font-semibold mb-4">Money flow</h2>
      <div className="flex flex-col gap-5">
        <FlowBar title="Income in" total={report.income} segs={incSegs} />
        <FlowBar title="…flows out to" total={outTotal} segs={outSegs} />
      </div>
    </section>
  );
}

function SummaryPanel({ report, prev, topMerchants }: { report: AnnualReport; prev: AnnualReport | null; topMerchants: TopMerchant[] }) {
  const py = report.year - 1;
  // Auto-insights derived from the loaded report (no extra queries).
  const insights: { label: string; value: string }[] = [];
  if (report.spendingByCategory[0]) insights.push({ label: 'Top spending category', value: `${report.spendingByCategory[0].name} · ${money0(report.spendingByCategory[0].amount)}` });
  if (report.incomeByCategory[0]) insights.push({ label: 'Largest income source', value: `${report.incomeByCategory[0].name} · ${money0(report.incomeByCategory[0].amount)}` });
  {
    let best = 0;
    let bestMonth = -1;
    let bestDir = '';
    for (let i = 1; i < report.months.length; i++) {
      const d = report.months[i]!.spending - report.months[i - 1]!.spending;
      if (Math.abs(d) > Math.abs(best)) { best = d; bestMonth = i; bestDir = d >= 0 ? 'up' : 'down'; }
    }
    if (bestMonth >= 0 && best !== 0) {
      const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      insights.push({ label: 'Biggest month-over-month swing', value: `Spending ${bestDir} ${money0(Math.abs(best))} in ${full[bestMonth]}` });
    }
  }
  const mMax = topMerchants.length ? Math.max(...topMerchants.map((m) => m.amount)) : 1;
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
      {/* Auto insights */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {insights.map((i) => (
            <div key={i.label} className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">{i.label}</div>
              <div className="text-[13.5px] font-medium text-text-primary">{i.value}</div>
            </div>
          ))}
        </div>
      )}

      <MoneyFlow report={report} />

      <div className="mb-5">
        <MonthlyChart report={report} prev={prev} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Breakdown title="Income by source" cats={report.incomeByCategory} tone="pos" year={report.year} />
        <Breakdown title="Spending by category" cats={report.spendingByCategory} tone="neg" year={report.year} />
      </div>

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h2 className="text-[14px] font-semibold mb-4">Top merchants</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
            {topMerchants.map((m) => (
              <Link
                key={m.merchant}
                href={`/transactions?merchant=${encodeURIComponent(m.merchant)}&from=${report.year}-01-01&to=${report.year}-12-31`}
                className="relative rounded-lg overflow-hidden block group"
                title={`See ${m.merchant} transactions`}
              >
                <div className="absolute inset-y-0 left-0 rounded-lg bg-negative opacity-[0.12] group-hover:opacity-20 transition-opacity" style={{ width: `${(m.amount / mMax) * 100}%` }} />
                <div className="relative flex justify-between items-center px-3 py-2 text-[13px]">
                  <span className="truncate text-text-secondary group-hover:text-text-primary transition-colors">{m.merchant}</span>
                  <span className="shrink-0 ml-2 text-right">
                    <span className="tabular-nums text-text-primary">{money0(m.amount)}</span>
                    <span className="text-[11px] text-text-muted ml-2 tabular-nums">{m.count}×</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
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
  { id: 'compare', label: 'Compare' },
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
  topMerchants,
}: {
  years: number[];
  report: AnnualReport;
  prevReport: AnnualReport | null;
  recurring: RecurringReport;
  anomalies: AnomalyReport;
  topMerchants: TopMerchant[];
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
                className="rounded-lg bg-surface-2 border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500 print:hidden"
                value={report.year}
                onChange={(e) => router.push(`/reports?year=${e.target.value}`)}
                aria-label="Report year"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2 print:hidden"
              >
                Print / PDF
              </button>
              <a
                href={`/api/export/transactions?from=${report.year}-01-01&to=${report.year}-12-31`}
                className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2 print:hidden"
              >
                Export {report.year} ↓
              </a>
            </>
          ) : undefined
        }
      />

      <div className="flex items-center gap-1 mb-6 border-b border-border-subtle print:hidden">
        {TABS.filter((t) => t.id !== 'compare' || prevReport).map((t) => (
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

      {tab === 'summary' && <SummaryPanel report={report} prev={prevReport} topMerchants={topMerchants} />}
      {tab === 'compare' && prevReport && <ComparePanel report={report} prev={prevReport} />}
      {tab === 'recurring' && <RecurringPanel data={recurring} />}
      {tab === 'anomalies' && <AnomaliesPanel data={anomalies} />}
      {tab === 'custom' && <CustomPanel />}
    </>
  );
}
