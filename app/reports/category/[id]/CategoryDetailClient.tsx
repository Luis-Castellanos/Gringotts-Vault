'use client';

import Link from 'next/link';

import type { CategoryDetail } from '@/lib/reports/load';
import { CategoryIcon } from '@/components/CategoryIcon';
import { fmtMoney0 as money0 } from '@/lib/format';

export function CategoryDetailClient({ detail, from, to }: { detail: CategoryDetail; from: string; to: string }) {
  const max = Math.max(1, ...detail.months.map((m) => m.amount));
  const mMax = detail.topMerchants.length ? Math.max(...detail.topMerchants.map((m) => m.amount)) : 1;
  const txnHref = `/transactions?cats=${encodeURIComponent(detail.id)}&from=${from}&to=${to}`;

  return (
    <>
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary mb-5">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3L5 7l4 4" /></svg>
        Reports
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <CategoryIcon name={detail.name} color={detail.color} size={40} />
          <div className="min-w-0">
            {detail.parentName && <div className="text-[12px] text-text-tertiary">{detail.parentName}</div>}
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] truncate">{detail.name}</h1>
          </div>
        </div>
        <Link href={txnHref} className="rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-500/90 shrink-0">
          View transactions →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Total</div>
          <div className="text-[20px] font-semibold tabular-nums">{money0(detail.total)}</div>
        </div>
        <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Transactions</div>
          <div className="text-[20px] font-semibold tabular-nums">{detail.count}</div>
        </div>
        <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.06em] text-text-muted mb-1">Avg / month</div>
          <div className="text-[20px] font-semibold tabular-nums">{money0(detail.months.length ? detail.total / detail.months.length : 0)}</div>
        </div>
      </div>

      {/* Monthly trend */}
      <section className="rounded-xl bg-surface-1 border border-border-subtle p-5 mb-6">
        <h2 className="text-[14px] font-semibold mb-4">Monthly trend</h2>
        {detail.total === 0 ? (
          <p className="text-[13px] text-text-tertiary py-3">No spending in this period.</p>
        ) : (
          <div className="flex items-end justify-between gap-2 h-40">
            {detail.months.map((m) => (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="flex items-end h-32 w-full justify-center">
                  <div className="w-3.5 rounded-t" style={{ height: `${(m.amount / max) * 100}%`, background: detail.color ?? 'var(--color-negative)', minHeight: m.amount > 0 ? 2 : 0 }} title={`${m.label} · ${money0(m.amount)}`} />
                </div>
                <span className="text-[10px] text-text-muted">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top merchants */}
      {detail.topMerchants.length > 0 && (
        <section className="rounded-xl bg-surface-1 border border-border-subtle p-5">
          <h2 className="text-[14px] font-semibold mb-4">Top merchants</h2>
          <div className="flex flex-col gap-2.5">
            {detail.topMerchants.map((m) => (
              <Link
                key={m.merchant}
                href={`/transactions?merchant=${encodeURIComponent(m.merchant)}&from=${from}&to=${to}`}
                className="relative rounded-lg overflow-hidden block group"
                title={`See ${m.merchant} transactions`}
              >
                <div className="absolute inset-y-0 left-0 rounded-lg opacity-[0.14] group-hover:opacity-[0.22] transition-opacity" style={{ width: `${(m.amount / mMax) * 100}%`, background: detail.color ?? 'var(--color-negative)' }} />
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
