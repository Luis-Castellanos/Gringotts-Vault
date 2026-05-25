import { eq, like, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';

export const metadata = { title: 'Transfers · Vault' };
export const dynamic = 'force-dynamic';

const usd = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

type Leg = 'in' | 'out';
type Xfer = { id: string; date: string; amount: number; account: string; sub: string; leg: Leg };

export default async function TransfersPage() {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      account: accounts.displayName,
      catSlug: categories.slug,
      catName: categories.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(or(like(categories.slug, 'transfers-transfers_in%'), like(categories.slug, 'transfers-transfers_out%')));

  const xfers: Xfer[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    account: r.account ?? '—',
    sub: r.catName,
    leg: r.catSlug.startsWith('transfers-transfers_in') ? 'in' : 'out',
  }));

  const inTotal = xfers.filter((x) => x.leg === 'in').reduce((s, x) => s + x.amount, 0);
  const outTotal = xfers.filter((x) => x.leg === 'out').reduce((s, x) => s + x.amount, 0);
  const net = inTotal + outTotal;

  // By sub-category
  const bySub = new Map<string, { in: number; out: number }>();
  for (const x of xfers) {
    const e = bySub.get(x.sub) ?? { in: 0, out: 0 };
    if (x.leg === 'in') e.in += x.amount; else e.out += x.amount;
    bySub.set(x.sub, e);
  }

  // By month
  const byMonth = new Map<string, { in: number; out: number }>();
  for (const x of xfers) {
    const m = x.date.slice(0, 7);
    const e = byMonth.get(m) ?? { in: 0, out: 0 };
    if (x.leg === 'in') e.in += x.amount; else e.out += x.amount;
    byMonth.set(m, e);
  }
  const months = [...byMonth.keys()].sort().reverse();

  // Naive matching: pair each Out with an unused In of equal |amount| within ±7 days, different account.
  const ins = xfers.filter((x) => x.leg === 'in').map((x) => ({ ...x, used: false }));
  const outs = xfers.filter((x) => x.leg === 'out');
  let matchedCount = 0;
  const unmatchedOut: Xfer[] = [];
  const dayDiff = (a: string, b: string) => Math.abs((+new Date(a) - +new Date(b)) / 86_400_000);
  for (const o of outs) {
    const m = ins.find((i) => !i.used && i.account !== o.account && Math.abs(Math.abs(i.amount) - Math.abs(o.amount)) < 0.01 && dayDiff(i.date, o.date) <= 7);
    if (m) { m.used = true; matchedCount++; } else unmatchedOut.push(o);
  }
  const unmatchedIn = ins.filter((i) => !i.used);

  const netClass = Math.abs(net) < 0.01 ? 'text-positive' : 'text-amber-400';

  return (
    <main className="w-full max-w-[1100px] px-10 pt-8 pb-20">
      <h1 className="text-[22px] font-semibold tracking-[-0.01em] mb-1">Transfers reconciliation</h1>
      <p className="text-[13px] text-text-tertiary mb-6">
        Every transfer should have an opposite leg, so In and Out net to zero. A non-zero net (or unmatched legs) points to an account or period you haven’t imported yet.
      </p>

      {xfers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
          No transfers categorized yet. Categorize transactions as Transfers In / Transfers Out (in Review) and they’ll reconcile here.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-border-subtle bg-surface-1 px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1">Transfers In</div>
              <div className="text-[22px] font-semibold tabular-nums text-positive">{usd0(inTotal)}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-1 px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1">Transfers Out</div>
              <div className="text-[22px] font-semibold tabular-nums text-negative">{usd0(outTotal)}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-1 px-5 py-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-muted mb-1">Net (should be $0)</div>
              <div className={`text-[22px] font-semibold tabular-nums ${netClass}`}>{usd0(net)}</div>
              <div className="text-[11.5px] text-text-tertiary mt-1">{matchedCount} matched pairs · {unmatchedOut.length + unmatchedIn.length} unmatched</div>
            </div>
          </div>

          {/* By sub-category */}
          <h2 className="text-[14px] font-semibold mb-2">By transfer type</h2>
          <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-8">
            <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted">
              <div>Type</div><div className="text-right">In</div><div className="text-right">Out</div><div className="text-right">Net</div>
            </div>
            {[...bySub.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sub, e]) => {
              const n = e.in + e.out;
              return (
                <div key={sub} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] tabular-nums first:border-t-0">
                  <div className="text-text-primary">{sub}</div>
                  <div className="text-right text-positive">{usd0(e.in)}</div>
                  <div className="text-right text-negative">{usd0(e.out)}</div>
                  <div className={`text-right ${Math.abs(n) < 0.01 ? 'text-text-tertiary' : 'text-amber-400'}`}>{usd0(n)}</div>
                </div>
              );
            })}
          </div>

          {/* By month */}
          <h2 className="text-[14px] font-semibold mb-2">By month</h2>
          <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-8">
            <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-2.5 border-b border-border-subtle text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-muted">
              <div>Month</div><div className="text-right">In</div><div className="text-right">Out</div><div className="text-right">Net</div>
            </div>
            {months.map((m) => {
              const e = byMonth.get(m)!;
              const n = e.in + e.out;
              return (
                <div key={m} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] tabular-nums first:border-t-0">
                  <div className="text-text-secondary">{m}</div>
                  <div className="text-right text-positive">{usd0(e.in)}</div>
                  <div className="text-right text-negative">{usd0(e.out)}</div>
                  <div className={`text-right ${Math.abs(n) < 0.01 ? 'text-text-tertiary' : 'text-amber-400'}`}>{usd0(n)}</div>
                </div>
              );
            })}
          </div>

          {/* Unmatched */}
          {(unmatchedOut.length > 0 || unmatchedIn.length > 0) && (
            <>
              <h2 className="text-[14px] font-semibold mb-1">Unmatched legs</h2>
              <p className="text-[12.5px] text-text-tertiary mb-2">No opposite leg within ±7 days — the other account/period is likely missing.</p>
              <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
                {[...unmatchedOut, ...unmatchedIn].sort((a, b) => b.date.localeCompare(a.date)).map((x) => (
                  <div key={x.id} className="grid grid-cols-[110px_1fr_140px_120px] gap-3 px-4 py-2.5 border-t border-border-subtle text-[13px] tabular-nums first:border-t-0 items-center">
                    <div className="text-text-tertiary">{x.date}</div>
                    <div className="text-text-secondary truncate">{x.sub}</div>
                    <div className="text-text-tertiary truncate">{x.account}</div>
                    <div className={`text-right ${x.leg === 'in' ? 'text-positive' : 'text-negative'}`}>{usd(x.amount)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
