import { asc, sql } from 'drizzle-orm';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
import { loadTaxonomyStyle } from '@/lib/taxonomy-style';
import { AccountsSettingsClient, type AcctRow } from './AccountsSettingsClient';
import './accounts-settings.css';

export const metadata = { title: 'Accounts · Vault' };
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const [acctRows, style, stats] = await Promise.all([
    db.select().from(accounts).orderBy(asc(accounts.name)),
    loadTaxonomyStyle(),
    db
      .select({
        accountId: transactions.accountId,
        count: sql<number>`count(*)::int`,
        balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text`,
      })
      .from(transactions)
      .groupBy(transactions.accountId),
  ]);
  const statById = new Map(stats.map((s) => [s.accountId, s]));

  const rows: AcctRow[] = acctRows.map((a) => {
    const s = statById.get(a.id);
    return {
      id: a.id,
      name: a.name,
      institution: a.institution ?? '',
      last4: a.accountNumber ?? '',
      type: a.type,
      icon: style.typeIcon[a.type] ?? '📁',
      assetClass: a.assetClass,
      isActive: a.isActive,
      openedDate: a.openedAt ?? null,
      creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
      apr: a.apr != null ? Number(a.apr) : null,
      apy: a.apy != null ? Number(a.apy) : null,
      interestRate: a.interestRate != null ? Number(a.interestRate) : null,
      monthlyPayment: a.monthlyPayment != null ? Number(a.monthlyPayment) : null,
      originalPrincipal: a.originalPrincipal != null ? Number(a.originalPrincipal) : null,
      maturityDate: a.maturityDate ?? null,
      accountSubtype: a.accountSubtype ?? null,
      count: s?.count ?? 0,
      balance: s ? Math.round(Number(s.balance) * 100) / 100 : 0,
    };
  });

  return (
    <PageShell variant="dashboard" className="acctset-page">
      <AccountsSettingsClient accounts={rows} />
    </PageShell>
  );
}
