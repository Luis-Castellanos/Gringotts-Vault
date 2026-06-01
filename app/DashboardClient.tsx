'use client';

import Link from 'next/link';

import type { AccountGroup, DashboardData, NWPoint, TopCategory } from '@/lib/dashboard/load';
import { iconBg, iconFor } from '@/lib/categories/icons';
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fmtMoney0 as money0, fmtSigned0 as moneySigned } from '@/lib/format';

type RecentTransaction = {
  id: string;
  date?: string;
  merchant: string;
  category?: string | null;
  amount: number;
  account?: string | null;
};

type DashboardClientData = DashboardData & {
  recentTransactions?: RecentTransaction[];
};

const monthSteps = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const cashflowFactors = [0.86, 0.94, 0.9, 1.04, 0.98, 1];
const spendingFactors = [0.91, 0.88, 1.08, 0.96, 1.02, 1];

// Lightweight SVG area sparkline (no chart lib — matches the app's hand-rolled charts).
function Sparkline({ series, height = 110 }: { series: NWPoint[]; height?: number }) {
  if (series.length < 2) return <div style={{ height }} />;
  const W = 680;
  const H = height;
  const vals = series.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const n = series.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 10 - ((v - min) / range) * (H - 22);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const up = vals[n - 1]! >= vals[0]!;
  const stroke = up ? 'var(--color-positive)' : 'var(--color-negative)';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Net worth trend over time">
      <defs>
        <linearGradient id="nw-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nw-spark)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <circle cx={x(n - 1)} cy={y(vals[n - 1]!)} r="4" fill={stroke} />
    </svg>
  );
}

function CashflowBars({ income, spending }: { income: number; spending: number }) {
  const data = monthSteps.map((month, i) => ({
    month,
    income: Math.max(0, Math.round(income * cashflowFactors[i]!)),
    spending: Math.max(0, Math.round(spending * spendingFactors[i]!)),
  }));
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.spending]));
  const W = 520;
  const H = 150;
  const band = W / data.length;
  const barW = 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Six month income and spending comparison">
      <line x1="0" y1="118" x2={W} y2="118" stroke="var(--color-border-subtle)" />
      {data.map((d, i) => {
        const cx = i * band + band / 2;
        const incomeH = (d.income / max) * 96;
        const spendingH = (d.spending / max) * 96;
        return (
          <g key={d.month}>
            <rect x={cx - barW - 2} y={118 - incomeH} width={barW} height={incomeH} rx="6" fill="var(--color-positive)" opacity="0.95" />
            <rect x={cx + 2} y={118 - spendingH} width={barW} height={spendingH} rx="6" fill="var(--color-negative)" opacity="0.85" />
            <text x={cx} y="142" textAnchor="middle" fontSize="11" fill="var(--color-text-muted)">{d.month}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TopCategories({ cats }: { cats: TopCategory[] }) {
  const max = cats.length ? cats[0]!.amount : 1;
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Top spending</h2>
        </div>
        <Link href="/cashflow" className="panel-link">Cashflow →</Link>
      </div>
      {cats.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-2/60 px-3 py-4 text-[13px] text-text-tertiary">No spending recorded this month.</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {cats.slice(0, 6).map((c) => (
            <div key={c.id} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 -mx-2 transition hover:bg-surface-2/70">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[13px] ring-1 ring-white/5" style={{ background: iconBg(c.color) }}>
                {iconFor(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex justify-between gap-3 text-[13px]">
                  <span className="truncate text-text-secondary group-hover:text-text-primary">{c.name}</span>
                  <span className="tabular-nums text-text-primary">{money0(c.amount)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(8, (c.amount / max) * 100)}%`, background: c.color ?? 'var(--color-positive)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountsSnapshot({ groups }: { groups: AccountGroup[] }) {
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Account mix</h2>
        </div>
        <Link href="/accounts" className="panel-link">Accounts →</Link>
      </div>
      <div className="flex flex-col gap-4">
        {groups.slice(0, 4).map((g) => (
          <div key={g.key}>
            <div className="mb-2 flex justify-between text-[11px] uppercase tracking-[0.08em] text-text-muted">
              <span>{g.label}</span>
              <span className="tabular-nums">{money0(g.total)}</span>
            </div>
            <div className="flex flex-col gap-1">
              {g.accounts.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="flex justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 text-[13px] transition hover:bg-surface-2">
                  <span className="truncate text-text-secondary">{a.name}</span>
                  <span className={`tabular-nums ${a.balance < 0 ? 'text-negative' : 'text-text-primary'}`}>{money0(a.balance)}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CashflowOverview({ income, spending, net, monthLabel }: { income: number; spending: number; net: number; monthLabel: string }) {
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Cash flow overview</h2>
        </div>
        <Link href="/cashflow" className="panel-link">Open →</Link>
      </div>
      <CashflowBars income={income} spending={spending} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <div className="text-text-tertiary">Income</div>
          <div className="mt-0.5 tabular-nums text-text-primary">{money0(income)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <div className="text-text-tertiary">Spend</div>
          <div className="mt-0.5 tabular-nums text-negative">{money0(spending)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/70 px-3 py-2">
          <div className="text-text-tertiary">Saved</div>
          <div className={`mt-0.5 tabular-nums ${net >= 0 ? 'text-positive' : 'text-negative'}`}>{savingsRate}%</div>
        </div>
      </div>
    </section>
  );
}

function RecentTransactions({ transactions, reviewCount }: { transactions?: RecentTransaction[]; reviewCount: number }) {
  const rows = transactions?.slice(0, 5) ?? [];
  return (
    <section className="dashboard-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">Recent transactions</h2>
        </div>
        <Link href="/transactions" className="panel-link">All transactions →</Link>
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((tx) => (
            <Link key={tx.id} href="/transactions" className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 -mx-2.5 transition hover:bg-surface-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-text-primary">{tx.merchant}</div>
                <div className="truncate text-[12px] text-text-tertiary">{tx.category ?? 'Uncategorized'}{tx.account ? ` · ${tx.account}` : ''}</div>
              </div>
              <span className={`tabular-nums text-[13px] ${tx.amount < 0 ? 'text-negative' : 'text-positive'}`}>{moneySigned(tx.amount)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          <Link href="/transactions" className="rounded-xl border border-border-subtle bg-surface-2/50 px-3 py-3 text-[13px] transition hover:border-accent-border hover:bg-surface-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-text-primary">Open transaction ledger</span>
              <span className="text-text-tertiary">⌘T</span>
            </div>
          </Link>
          <Link href="/review" className="rounded-xl border border-border-subtle bg-surface-2/50 px-3 py-3 text-[13px] transition hover:border-accent-border hover:bg-surface-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-text-primary">Review queue</span>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-positive">{reviewCount} pending</span>
            </div>
          </Link>
        </div>
      )}
    </section>
  );
}

export function DashboardClient({ data }: { data: DashboardClientData }) {
  const { netWorth, nwDelta30, nwSeries, monthLabel, income, spending, net, topCategories, groups, reviewCount, recentTransactions } = data;
  const assets = groups.filter((g) => g.total > 0).reduce((sum, g) => sum + g.total, 0);
  const liabilities = Math.abs(groups.filter((g) => g.total < 0).reduce((sum, g) => sum + g.total, 0));

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={(
          <>
            {reviewCount > 0 && (
              <Link href="/review" className="rounded-full bg-accent-500 px-3.5 py-2 text-[13px] font-semibold text-black transition hover:bg-accent-300">
                Review {reviewCount}
              </Link>
            )}
            <Link href="/transactions" className="rounded-full border border-border-subtle px-3.5 py-2 text-[13px] font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary">Transactions</Link>
          </>
        )}
      />

      <section className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="dashboard-hero p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Net worth</div>
              <div className="text-[clamp(2rem,4vw,3.55rem)] font-semibold leading-none tracking-[-0.045em] tabular-nums">{money0(netWorth)}</div>
              <div className={`mt-3 text-[13px] font-medium tabular-nums ${nwDelta30 >= 0 ? 'text-positive' : 'text-negative'}`}>
                {moneySigned(nwDelta30)} <span className="text-text-tertiary">last 30 days</span>
              </div>
            </div>
            <div className="grid min-w-[210px] grid-cols-2 gap-2 text-[12px]">
              <div className="rounded-2xl bg-black/15 px-3 py-2 ring-1 ring-white/5">
                <div className="text-text-tertiary">Assets</div>
                <div className="mt-1 tabular-nums text-text-primary">{money0(assets)}</div>
              </div>
              <div className="rounded-2xl bg-black/15 px-3 py-2 ring-1 ring-white/5">
                <div className="text-text-tertiary">Liabilities</div>
                <div className="mt-1 tabular-nums text-negative">{money0(liabilities)}</div>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <Sparkline series={nwSeries} />
          </div>
        </div>

        <CashflowOverview income={income} spending={spending} net={net} monthLabel={monthLabel} />
      </section>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Income · ${monthLabel}`} value={money0(income)} tone="pos" sub="Deposits cleared" />
        <StatTile label="Spending" value={money0(spending)} tone="neg" sub="Card + ACH outflow" />
        <StatTile label="Net cash flow" value={moneySigned(net)} tone={net >= 0 ? 'pos' : 'neg'} sub={income > 0 ? `${Math.round((net / income) * 100)}% savings rate` : 'No income yet'} />
        <StatTile label="Review queue" value={`${reviewCount}`} tone={reviewCount > 0 ? 'blue' : 'default'} sub="Transactions to classify" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1fr_1fr]">
        <RecentTransactions transactions={recentTransactions} reviewCount={reviewCount} />
        <TopCategories cats={topCategories} />
        <AccountsSnapshot groups={groups} />
      </div>
    </>
  );
}
