'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

import Link from 'next/link';

import type { AnnualReport, BalanceSheet, BalanceSheetAccount, ReportCategory, TopMerchant } from '@/lib/reports/load';
import { PERIOD_PRESETS, type PeriodId, type ResolvedPeriod } from '@/lib/reports/period';
import type { RecurringReport, Cadence } from '@/lib/reports/recurring';
import type { AnomalyReport } from '@/lib/reports/anomalies';
import { StatTile } from '@/components/StatTile';
import { CategoryIcon } from '@/components/CategoryIcon';
import { fmtMoney0 as money0, fmtDate } from '@/lib/format';
import { CustomPanel } from './CustomPanel';

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

type Tab = 'summary' | 'income-statement' | 'balance-sheet' | 'compare' | 'recurring' | 'anomalies' | 'custom';
type ReportDisplayOptions = {
  insights: boolean;
  moneyFlow: boolean;
  monthlyChart: boolean;
  breakdowns: boolean;
  topMerchants: boolean;
};

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
  const py = prev.label;
  const cy = report.label;
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

function Breakdown({ title, cats, tone, from, to }: { title: string; cats: ReportCategory[]; tone: 'pos' | 'neg'; from: string; to: string }) {
  const max = cats.length ? Math.max(...cats.map((c) => c.amount)) : 1;
  const barColor = tone === 'pos' ? 'var(--color-positive)' : 'var(--color-negative)';
  // Click a row → the category deep-dive (Uncategorized has no detail page, so
  // it goes straight to the filtered Transactions list).
  const href = (id: string) =>
    id === 'uncat'
      ? `/transactions?cats=__uncategorized__&from=${from}&to=${to}`
      : `/reports/category/${id}?from=${from}&to=${to}`;
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
  // Ghost bars only when the prior window lines up 1:1 with this one (same length).
  const ghost = prev && prev.months.length === report.months.length ? prev : null;
  const max = Math.max(1, ...report.months.flatMap((m) => [m.income, m.spending]), ...(ghost?.months.map((m) => m.spending) ?? []));
  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-[14px] font-semibold">Income vs spending by month</h2>
        <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-cat-blue" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-negative" /> Spending</span>
          {ghost && <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-text-muted/40" /> prior spend</span>}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 h-40">
        {report.months.map((m, i) => {
          const prevSpend = ghost?.months[i]?.spending ?? null;
          return (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                {prevSpend != null && (
                  <div className="w-1.5 rounded-t bg-text-muted/35" style={{ height: `${(prevSpend / max) * 100}%` }} title={`Prior spending ${money0(prevSpend)}`} />
                )}
                <div className="w-2.5 rounded-t bg-cat-blue" style={{ height: `${(m.income / max) * 100}%` }} title={`${m.label} income ${money0(m.income)}`} />
                <div className="w-2.5 rounded-t bg-negative" style={{ height: `${(m.spending / max) * 100}%` }} title={`${m.label} spending ${money0(m.spending)}`} />
              </div>
              <span className="text-[10px] text-text-muted">{m.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoneyFlow({ report }: { report: AnnualReport }) {
  // Curved Sankey: a single "Income" source on the left flows to spending
  // categories (+ Saved) on the right, link width ∝ amount.
  const cats = report.spendingByCategory;
  const TOP = 9;
  const right: { name: string; amount: number; color: string }[] = cats
    .slice(0, TOP)
    .map((c) => ({ name: c.name, amount: c.amount, color: c.color ?? 'var(--color-negative)' }));
  const otherAmt = cats.slice(TOP).reduce((s, c) => s + c.amount, 0);
  if (otherAmt > 0) right.push({ name: 'Other', amount: otherAmt, color: 'var(--color-text-muted)' });
  if (report.net > 0) right.push({ name: 'Saved', amount: report.net, color: 'var(--color-positive)' });
  const total = right.reduce((s, r) => s + r.amount, 0);
  if (total <= 0 || right.length === 0) return null;

  const W = 720;
  const padTop = 22;
  const rowH = 34;
  const gap = 8;
  const H = padTop + right.length * rowH;
  const chartH = right.length * rowH - 6;
  const leftX = 2;
  const leftW = 14;
  const rightNodeX = 246;
  const rightNodeW = 14;
  const linkStart = leftX + leftW;
  const totalGap = gap * (right.length - 1);
  const rightAvail = chartH - totalGap;
  const midX = (linkStart + rightNodeX) / 2;

  let lY = padTop;
  let rY = padTop;
  const bands = right.map((n) => {
    const frac = n.amount / total;
    const lh = frac * chartH;
    const rh = Math.max(1.5, frac * rightAvail);
    const b = { ...n, lY, lh, rY, rh };
    lY += lh;
    rY += rh + gap;
    return b;
  });

  return (
    <section className="rounded-xl bg-surface-1 border border-border-subtle p-5 mb-5">
      <h2 className="text-[14px] font-semibold mb-1">Money flow</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }} role="img" aria-label="Income to spending flow">
        {bands.map((b) => (
          <path
            key={b.name}
            d={`M ${linkStart},${b.lY} C ${midX},${b.lY} ${midX},${b.rY} ${rightNodeX},${b.rY} L ${rightNodeX},${b.rY + b.rh} C ${midX},${b.rY + b.rh} ${midX},${b.lY + b.lh} ${linkStart},${b.lY + b.lh} Z`}
            fill={b.color}
            opacity={0.3}
          >
            <title>{b.name} · {money0(b.amount)} ({Math.round((b.amount / total) * 100)}%)</title>
          </path>
        ))}
        <rect x={leftX} y={padTop} width={leftW} height={chartH} rx={3} fill="var(--color-cat-blue)" />
        <text x={leftX} y={padTop - 8} fontSize="11" fill="var(--color-text-muted)">Income {money0(report.income)}</text>
        {bands.map((b) => (
          <g key={b.name}>
            <rect x={rightNodeX} y={b.rY} width={rightNodeW} height={b.rh} rx={3} fill={b.color} />
            <text x={rightNodeX + rightNodeW + 8} y={b.rY + b.rh / 2} dominantBaseline="middle" fontSize="12.5" fill="var(--color-text-secondary)">
              {(b.name.length > 26 ? b.name.slice(0, 25) + '…' : b.name)} · {money0(b.amount)}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}

function SummaryPanel({
  report,
  prev,
  topMerchants,
  options,
  merchantLimit,
}: {
  report: AnnualReport;
  prev: AnnualReport | null;
  topMerchants: TopMerchant[];
  options: ReportDisplayOptions;
  merchantLimit: number;
}) {
  const py = prev?.label ?? 'prior period';
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
      insights.push({ label: 'Biggest month-over-month swing', value: `Spending ${bestDir} ${money0(Math.abs(best))} in ${report.months[bestMonth]!.label}` });
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
        In <span className="font-semibold text-text-primary">{report.label}</span> you {report.net >= 0 ? 'saved' : 'spent a net'}{' '}
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
      {options.insights && insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {insights.map((i) => (
            <div key={i.label} className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">{i.label}</div>
              <div className="text-[13.5px] font-medium text-text-primary">{i.value}</div>
            </div>
          ))}
        </div>
      )}

      {options.moneyFlow && <MoneyFlow report={report} />}

      {options.monthlyChart && <div className="mb-5">
        <MonthlyChart report={report} prev={prev} />
      </div>}
      {options.breakdowns && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <Breakdown title="Income by source" cats={report.incomeByCategory} tone="pos" from={report.from} to={report.to} />
        <Breakdown title="Spending by category" cats={report.spendingByCategory} tone="neg" from={report.from} to={report.to} />
      </div>}

      {/* Top merchants */}
      {options.topMerchants && topMerchants.length > 0 && (
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h2 className="text-[14px] font-semibold mb-4">Top merchants</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
            {topMerchants.slice(0, merchantLimit).map((m) => (
              <Link
                key={m.merchant}
                href={`/transactions?merchant=${encodeURIComponent(m.merchant)}&from=${report.from}&to=${report.to}`}
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

function StatementSection({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: ReportCategory[];
  total: number;
  tone: 'pos' | 'neg';
}) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className={`text-[14px] font-semibold tabular-nums ${tone === 'pos' ? 'text-positive' : 'text-negative'}`}>{money0(total)}</span>
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <div className="px-5 py-4 text-[13px] text-text-tertiary">Nothing recorded.</div>
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={row.id === 'uncat' ? `/transactions?cats=__uncategorized__` : `/reports/category/${row.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 text-[13.5px] hover:bg-surface-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CategoryIcon name={row.name} color={row.color} size={20} />
                <span className="truncate text-text-secondary">{row.name}</span>
              </span>
              <span className="font-medium tabular-nums text-text-primary">{money0(row.amount)}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function IncomeStatementPanel({ report }: { report: AnnualReport }) {
  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatTile label="Revenue" value={money0(report.income)} tone="blue" sub={report.label} />
        <StatTile label="Expenses" value={money0(report.spending)} tone="neg" sub="Operating outflows" />
        <StatTile label="Net income" value={money0(report.net)} tone={report.net >= 0 ? 'pos' : 'neg'} />
        <StatTile label="Margin" value={report.savingsRate != null ? `${report.savingsRate}%` : '—'} sub="Net / revenue" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StatementSection title="Revenue" rows={report.incomeByCategory} total={report.income} tone="pos" />
        <StatementSection title="Expenses" rows={report.spendingByCategory} total={report.spending} tone="neg" />
      </div>
      <section className="mt-5 rounded-xl border border-border-subtle bg-surface-1 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold">Net income</h2>
          </div>
          <span className={`text-[22px] font-semibold tabular-nums ${report.net >= 0 ? 'text-positive' : 'text-negative'}`}>{money0(report.net)}</span>
        </div>
      </section>
    </>
  );
}

function BalanceAccountTable({ title, rows, total }: { title: string; rows: BalanceSheetAccount[]; total: number }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle px-5 py-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className="text-[14px] font-semibold tabular-nums">{money0(total)}</span>
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <div className="px-5 py-4 text-[13px] text-text-tertiary">No active accounts.</div>
        ) : (
          rows.map((row) => (
            <Link key={row.id} href={`/accounts/${row.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 hover:bg-surface-2">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium text-text-primary">{row.name}</span>
                <span className="mt-0.5 block truncate text-[12px] text-text-tertiary">{row.institution || row.typeLabel} · {row.typeLabel}</span>
              </span>
              <span className="text-[13.5px] font-medium tabular-nums text-text-primary">{money0(Math.abs(row.balance))}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function BalanceSheetPanel({ balanceSheet }: { balanceSheet: BalanceSheet }) {
  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile label="Assets" value={money0(balanceSheet.assets)} tone="blue" sub={`As of ${balanceSheet.asOf}`} />
        <StatTile label="Liabilities" value={money0(balanceSheet.liabilities)} tone="neg" />
        <StatTile label="Net worth" value={money0(balanceSheet.equity)} tone={balanceSheet.equity >= 0 ? 'pos' : 'neg'} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BalanceAccountTable title="Assets" rows={balanceSheet.assetAccounts} total={balanceSheet.assets} />
        <BalanceAccountTable title="Liabilities" rows={balanceSheet.liabilityAccounts} total={balanceSheet.liabilities} />
      </div>
      <section className="mt-5 rounded-xl border border-border-subtle bg-surface-1 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[14px] font-semibold">Net worth</h2>
          </div>
          <span className={`text-[22px] font-semibold tabular-nums ${balanceSheet.equity >= 0 ? 'text-positive' : 'text-negative'}`}>{money0(balanceSheet.equity)}</span>
        </div>
      </section>
    </>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'income-statement', label: 'Income Statement' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'compare', label: 'Compare' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'custom', label: 'Custom' },
];

function PeriodControl({ period, years, report }: { period: ResolvedPeriod; years: number[]; report: AnnualReport }) {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(period.id === 'custom');
  const [cf, setCf] = useState(period.from);
  const [ct, setCt] = useState(period.to);
  const go = (qs: string) => router.push(`/reports?${qs}`);
  const onPreset = (id: PeriodId) => {
    if (id === 'custom') { setCustomOpen(true); return; }
    setCustomOpen(false);
    go(id === 'year' ? `period=year&year=${period.year ?? years[0]}` : `period=${id}`);
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap print:hidden">
      <div className="inline-flex items-center rounded-lg border border-border-subtle p-0.5">
        {PERIOD_PRESETS.map((p) => {
          const active = p.id === 'custom' ? period.id === 'custom' || customOpen : period.id === p.id;
          return (
            <button key={p.id} type="button" onClick={() => onPreset(p.id)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${active ? 'bg-accent-500 text-white' : 'text-text-tertiary hover:text-text-primary'}`}>
              {p.label}
            </button>
          );
        })}
      </div>
      {period.id === 'year' && (
        <select
          className="rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 text-[13px] text-text-secondary focus:outline-none focus:border-accent-500"
          value={period.year} onChange={(e) => go(`period=year&year=${e.target.value}`)} aria-label="Report year"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
      {customOpen && (
        <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
          <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base px-2 py-1 text-[12px] focus:outline-none" />
          →
          <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="rounded-md border border-border-subtle bg-surface-base px-2 py-1 text-[12px] focus:outline-none" />
          <button type="button" disabled={!cf || !ct} onClick={() => cf && ct && go(`period=custom&from=${cf}&to=${ct}`)}
            className="rounded-md bg-accent-500 disabled:opacity-50 text-white px-2.5 py-1 text-[12px] font-medium">Apply</button>
        </span>
      )}
      <button type="button" onClick={() => window.print()} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Print / PDF</button>
      <a href={`/api/export/transactions?from=${report.from}&to=${report.to}`} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:bg-surface-2">Export ↓</a>
    </div>
  );
}

function ReportOptionsPanel({
  period,
  years,
  report,
  options,
  setOptions,
  merchantLimit,
  setMerchantLimit,
  onClose,
}: {
  period: ResolvedPeriod;
  years: number[];
  report: AnnualReport;
  options: ReportDisplayOptions;
  setOptions: React.Dispatch<React.SetStateAction<ReportDisplayOptions>>;
  merchantLimit: number;
  setMerchantLimit: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
}) {
  const toggle = (key: keyof ReportDisplayOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));
  return (
    <aside className="rounded-2xl border border-border-subtle bg-surface-1 p-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto print:hidden">
      <div className="mb-7 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold">Report filters</h2>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full border border-border-subtle text-[24px] text-text-tertiary hover:text-text-primary">×</button>
      </div>

      <section className="rounded-xl border border-border-subtle p-4">
        <div className="mb-3 text-[15px] font-semibold">Report window</div>
        <PeriodControl period={period} years={years} report={report} />
      </section>

      <section className="mt-7 rounded-xl border border-border-subtle p-5">
        <h3 className="text-[16px] font-semibold">Visible sections</h3>
        <div className="mt-5 space-y-3">
          {([
            ['insights', 'Auto insights'],
            ['moneyFlow', 'Money flow'],
            ['monthlyChart', 'Monthly chart'],
            ['breakdowns', 'Category breakdowns'],
            ['topMerchants', 'Top merchants'],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => toggle(key)} className="flex w-full items-center justify-between rounded-xl border border-border-subtle px-4 py-3 text-left hover:bg-surface-2">
              <span className="text-[14px] font-semibold">{label}</span>
              <span className={`relative h-6 w-11 rounded-full transition ${options[key] ? 'bg-accent-500' : 'bg-surface-3'}`}>
                <span className={`absolute top-1 size-4 rounded-full bg-surface-0 transition ${options[key] ? 'left-6' : 'left-1'}`} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-7 rounded-xl border border-border-subtle p-5">
        <h3 className="text-[16px] font-semibold">Top merchants</h3>
        <div className="mt-5 flex items-center gap-4">
          <input className="flex-1 accent-[var(--color-accent-500)]" type="range" min={4} max={20} value={merchantLimit} onChange={(event) => setMerchantLimit(Number(event.target.value))} />
          <span className="w-16 rounded-xl border border-border-subtle px-3 py-2 text-center text-[16px] font-semibold tabular-nums">{merchantLimit}</span>
        </div>
      </section>

      <section className="mt-7 rounded-xl border border-border-subtle p-5">
        <h3 className="text-[16px] font-semibold">Current report</h3>
        <div className="mt-4 grid gap-3 text-[14px]">
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Income</span><span className="font-semibold tabular-nums">{money0(report.income)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Spending</span><span className="font-semibold tabular-nums">{money0(report.spending)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Net</span><span className={`font-semibold tabular-nums ${report.net >= 0 ? 'text-positive' : 'text-negative'}`}>{money0(report.net)}</span></div>
        </div>
      </section>
    </aside>
  );
}

export function ReportsClient({
  years,
  period,
  report,
  prevReport,
  recurring,
  anomalies,
  topMerchants,
  balanceSheet,
}: {
  years: number[];
  period: ResolvedPeriod;
  report: AnnualReport;
  prevReport: AnnualReport | null;
  recurring: RecurringReport;
  anomalies: AnomalyReport;
  topMerchants: TopMerchant[];
  balanceSheet: BalanceSheet;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [merchantLimit, setMerchantLimit] = useState(10);
  const [options, setOptions] = useState<ReportDisplayOptions>({
    insights: true,
    moneyFlow: true,
    monthlyChart: true,
    breakdowns: true,
    topMerchants: true,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Reports</h1>
          <span className="rounded-full bg-[rgba(194,78,0,0.25)] px-3 py-1 text-[13px] font-semibold text-accent-400">Saved view</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[14px] font-semibold text-text-tertiary">
          <span>Saved just now</span>
          <button type="button" className="rounded-full border border-border-subtle px-4 py-2 text-text-secondary">◎ {report.label}</button>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="flex size-10 items-center justify-center rounded-full border border-border-subtle text-[22px]">＋</button>
        </div>
      </header>

      <div className={`grid gap-5 ${filtersOpen ? 'xl:grid-cols-[minmax(0,1fr)_430px]' : ''}`}>
        <div className="space-y-5">
          <section className="rounded-2xl border border-border-subtle bg-surface-1 p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-text-tertiary">◎</span>
                <h2 className="text-[22px] font-semibold">Reporting dashboard</h2>
                <span className="text-text-tertiary">…</span>
              </div>
              <div className="flex flex-wrap gap-3 print:hidden">
                <button type="button" className="rounded-xl border border-border-subtle px-4 py-3 text-[14px] font-semibold">▷ Watch walkthrough</button>
                <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="rounded-xl border border-border-subtle px-4 py-3 text-[14px] font-semibold">✎ Edit filters</button>
                <button type="button" onClick={() => setTab('custom')} className="rounded-xl bg-accent-500 px-5 py-3 text-[14px] font-semibold text-[var(--color-accent-contrast)]">＋ New report</button>
              </div>
            </div>

            <div className="grid rounded-xl border border-border-subtle md:grid-cols-4">
              {[
                ['Income', money0(report.income), 'text-cat-blue'],
                ['Spending', money0(report.spending), 'text-negative'],
                ['Net', money0(report.net), report.net >= 0 ? 'text-positive' : 'text-negative'],
                ['Savings rate', report.savingsRate != null ? `${report.savingsRate}%` : '—', ''],
              ].map(([label, value, tone], index) => (
                <div key={label} className="border-b border-border-subtle px-7 py-6 md:border-b-0 md:border-r md:last:border-r-0">
                  <p className="text-[14px] font-semibold text-text-tertiary">{label} ⓘ</p>
                  <p className={`mt-4 text-[30px] font-semibold tabular-nums ${tone}`}>{value}</p>
                  {index === 0 && <p className="mt-1 text-[12px] text-text-muted">{report.from} → {report.to}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-1">
            <div className="flex gap-3 border-b border-border-subtle p-5 print:hidden">
              {TABS.filter((t) => t.id !== 'compare' || prevReport).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-5 py-2 text-[14px] font-semibold transition-colors ${
                    tab === t.id ? 'bg-surface-3 text-text-primary' : 'text-text-tertiary hover:text-text-primary'
                  }`}
                >
                  {t.label}
                  {t.id === 'recurring' && recurring.activeCount > 0 && <span className="ml-1.5 text-[11px] text-text-muted tabular-nums">{recurring.activeCount}</span>}
                  {t.id === 'anomalies' && anomalies.anomalies.length > 0 && <span className="ml-1.5 text-[11px] rounded bg-negative/15 text-negative px-1.5 py-0.5 tabular-nums">{anomalies.anomalies.length}</span>}
                </button>
              ))}
            </div>
            <div className="p-5">
              {tab === 'summary' && <SummaryPanel report={report} prev={prevReport} topMerchants={topMerchants} options={options} merchantLimit={merchantLimit} />}
              {tab === 'income-statement' && <IncomeStatementPanel report={report} />}
              {tab === 'balance-sheet' && <BalanceSheetPanel balanceSheet={balanceSheet} />}
              {tab === 'compare' && prevReport && <ComparePanel report={report} prev={prevReport} />}
              {tab === 'recurring' && <RecurringPanel data={recurring} />}
              {tab === 'anomalies' && <AnomaliesPanel data={anomalies} />}
              {tab === 'custom' && <CustomPanel />}
            </div>
          </section>
        </div>

        {filtersOpen && (
          <ReportOptionsPanel
            period={period}
            years={years}
            report={report}
            options={options}
            setOptions={setOptions}
            merchantLimit={merchantLimit}
            setMerchantLimit={setMerchantLimit}
            onClose={() => setFiltersOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
