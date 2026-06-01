import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { notFound } from 'next/navigation';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { TransactionsClient, type CatLite } from '@/app/transactions/TransactionsClient';
import { countTransactions, loadMerchants, loadTransactions } from '@/lib/transactions/load';
import { loadAccountBalanceSeries, loadAccountDetail } from '@/lib/accounts/detail';
import { accountTypeLabel } from '@/lib/account-types';
import { AccountDetailHeader } from './AccountDetailHeader';
import '@/app/transactions/transactions.css';
import './account-detail.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await loadAccountDetail(id);
  return { title: account ? `${account.displayName || account.name} · Vault` : 'Account · Vault' };
}

function fmtMoney(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await loadAccountDetail(id);
  if (!account) notFound();

  const filters = { accountIds: [id] };
  const parentCat = alias(categories, 'parent_cat');
  const [txns, total, merchants, series, catList] = await Promise.all([
    loadTransactions(null, 0, filters), // preload all of this account's transactions
    countTransactions(filters),
    loadMerchants(),
    loadAccountBalanceSeries(id),
    db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        parentId: categories.parentId,
        parentName: parentCat.name,
      })
      .from(categories)
      .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
      .where(eq(categories.isArchived, false))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  const catLites: CatLite[] = catList.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    parentId: c.parentId ?? null,
    parentName: c.parentName ?? null,
  }));

  const currentBalance = series.length ? series[series.length - 1]!.balance : 0;
  const owed = Math.abs(currentBalance);
  const isCard = account.type === 'credit_card';
  const utilization =
    isCard && account.creditLimit ? Math.min((owed / account.creditLimit) * 100, 100) : null;

  // Summary rows (label/value pairs) tailored to the account type.
  const rows: { label: string; value: string }[] = [
    { label: 'Institution', value: account.institution || '—' },
    { label: 'Account type', value: accountTypeLabel(account.type) },
  ];
  if (isCard && account.creditLimit != null) {
    rows.push({ label: 'Credit limit', value: fmtMoney(account.creditLimit) });
    rows.push({ label: 'Credit remaining', value: fmtMoney(Math.max(account.creditLimit - owed, 0)) });
  }
  if (account.apr != null) rows.push({ label: 'APR', value: `${account.apr.toFixed(2)}%` });
  if (account.apy != null) rows.push({ label: 'APY', value: `${account.apy.toFixed(2)}%` });
  if (account.interestRate != null) rows.push({ label: 'Interest rate', value: `${account.interestRate.toFixed(2)}%` });
  if (account.monthlyPayment != null) rows.push({ label: 'Monthly payment', value: fmtMoney(account.monthlyPayment) });
  if (account.accountSubtype) rows.push({ label: 'Subtype', value: account.accountSubtype });
  if (account.openedAt) {
    rows.push({
      label: 'Opened',
      value: new Date(account.openedAt + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
  }
  rows.push({ label: 'Total transactions', value: total.toLocaleString() });

  return (
    <PageShell variant="form" className="account-detail-page">
      <AccountDetailHeader account={account} series={series} />

      <div className="ad-body">
        <section className="ad-transactions transactions-page">
          <TransactionsClient
            txns={txns}
            total={total}
            accounts={[]}
            categories={catLites}
            merchants={merchants}
            lockAccountId={id}
          />
        </section>

        <aside className="ad-summary">
          <div className="ad-card">
            <h3>Summary</h3>
            {utilization != null && (
              <div className="ad-util">
                <div className="ad-util-top">
                  <span>Credit utilization</span>
                  <strong>{utilization.toFixed(0)}%</strong>
                </div>
                <div className="ad-util-bar">
                  <div
                    className={'ad-util-fill' + (utilization >= 70 ? ' high' : utilization >= 30 ? ' mid' : '')}
                    style={{ width: `${utilization}%` }}
                  />
                </div>
              </div>
            )}
            <dl className="ad-stats">
              {rows.map((r) => (
                <div key={r.label} className="ad-stat">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
