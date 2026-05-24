import { existsSync } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, transactions } from '@/lib/db/schema';
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
      // Phase B continues: still nullable until further migrations land.
      annualFee: null,
      annualFeeDueDate: null,
      statementBalance: null,
      statementClosingDate: null,
      dueDate: null,
      minPayment: null,
      cashbackYTD: null,
      signupBonus: null,
      benefits: null,
      isNoPreset: false,
      network: null,
      state: 'steady',
    };
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="cc-page w-full max-w-[1100px] px-8 pt-7 pb-20">
          <CreditCardsClient cards={cards} />
        </main>
      </div>
    </div>
  );
}
