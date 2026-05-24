import { existsSync } from 'node:fs';
import path from 'node:path';
import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, categories, transactions } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { CreditCardsClient, type CreditCardData } from './CreditCardsClient';
import './credit-cards.css';

export const metadata = { title: 'Credit Cards · Vault' };

// Force dynamic — Drizzle query against Neon, no caching.
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function CreditCardsPage() {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      displayName: accounts.displayName,
      institution: accounts.institution,
      accountNumber: accounts.accountNumber,
      color: accounts.color,
      isActive: accounts.isActive,
      openedAt: accounts.openedAt,
      closedAt: accounts.closedAt,
      creditLimit: accounts.creditLimit,
      apr: accounts.apr,
      // Balance owed = -SUM(amount). Outflows on a credit card are negative,
      // so -SUM gives a positive number representing what you owe.
      balanceRaw: sql<string | null>`COALESCE((-SUM(${transactions.amount}))::text, '0')`,
      // Server-side hint for the openedAt date picker — can't be after this.
      earliestTxnDate: sql<string | null>`MIN(${transactions.date})::text`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.type, 'credit_card'))
    .groupBy(accounts.id)
    .orderBy(accounts.name);

  // Cashback YTD per card — sum of this-year transactions categorized as
  // cashback / rewards (statement credits on the card are positive amounts).
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const cashbackRows = await db
    .select({
      accountId: transactions.accountId,
      total: sql<string>`SUM(${transactions.amount})::text`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, yearStart),
        sql`(${categories.slug} ILIKE '%cashback%' OR ${categories.name} ILIKE '%cashback%' OR ${categories.name} ILIKE '%cash back%' OR ${categories.name} ILIKE '%reward%')`,
      ),
    )
    .groupBy(transactions.accountId);
  const cashbackByAccount = new Map(cashbackRows.map((r) => [r.accountId, Number(r.total)]));

  // Most recent annual-fee charge per card → fee amount + estimated next due (+1yr).
  const feeRows = await db
    .select({
      accountId: transactions.accountId,
      lastDate: sql<string>`MAX(${transactions.date})::text`,
      lastAmount: sql<string>`(ARRAY_AGG(${transactions.amount} ORDER BY ${transactions.date} DESC))[1]::text`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(sql`(${categories.name} ILIKE '%annual fee%' OR ${categories.slug} ILIKE '%annual%fee%')`)
    .groupBy(transactions.accountId);
  const feeByAccount = new Map(
    feeRows.map((r) => [r.accountId, { amount: Math.abs(Number(r.lastAmount)), lastDate: r.lastDate }]),
  );

  // Lifetime charges per card (sum of spend = abs of negative amounts) — for closed cards.
  const spendRows = await db
    .select({
      accountId: transactions.accountId,
      spend: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.amount} < 0 THEN -${transactions.amount} ELSE 0 END), 0)::text`,
    })
    .from(transactions)
    .groupBy(transactions.accountId);
  const spendByAccount = new Map(spendRows.map((r) => [r.accountId, Number(r.spend)]));

  function addYear(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  const publicDir = path.join(process.cwd(), 'public', 'card-art');
  const cards: CreditCardData[] = rows.map((r) => {
    const slug = slugify(r.name);
    const artFile = `${slug}.png`;
    const artUrl = existsSync(path.join(publicDir, artFile))
      ? `/card-art/${artFile}`
      : null;

    return {
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      institution: r.institution ?? '',
      last4: r.accountNumber ?? '',
      balance: Number(r.balanceRaw ?? 0),
      openedDate: r.openedAt ?? null,
      closedDate: r.closedAt ?? null,
      isActive: r.isActive,
      artUrl,
      limit: r.creditLimit != null ? Number(r.creditLimit) : null,
      apr: r.apr != null ? Number(r.apr) : null,
      earliestTxnDate: r.earliestTxnDate ?? null,
      // Derived from transactions:
      cashbackYTD: cashbackByAccount.get(r.id) ?? null,
      annualFee: feeByAccount.get(r.id)?.amount ?? null,
      annualFeeDueDate: feeByAccount.has(r.id) ? addYear(feeByAccount.get(r.id)!.lastDate) : null,
      lifetimeSpend: spendByAccount.get(r.id) ?? null,
      signupBonus: null,
      benefits: null,
      isNoPreset: false,
      network: null,
      state: 'steady',
    };
  });

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="cc-page w-full max-w-[1600px] px-6 pt-6 pb-20">
          <CreditCardsClient cards={cards} />
        </main>
      </div>
    </div>
  );
}
