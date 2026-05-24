/**
 * Inspect the most recent upload(s): the documents row, the account it matched,
 * and a summary + sample of the transactions it wrote. Read-only.
 *   npx tsx scripts/inspect-upload.ts
 */

import 'dotenv/config';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, documents, transactions } from '@/lib/db/schema';

async function main() {
  const docs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      type: documents.detectedType,
      issuer: documents.detectedIssuer,
      account: documents.accountLabel,
      accountIds: documents.accountIds,
      period: documents.statementPeriod,
      status: documents.status,
      count: documents.transactionCount,
      bytes: documents.byteSize,
    })
    .from(documents)
    .orderBy(desc(documents.uploadedAt))
    .limit(5);

  console.log('=== documents ===');
  for (const d of docs) {
    console.log(
      `  ${d.fileName}\n    status=${d.status} type=${d.type} issuer=${d.issuer} rows=${d.count}\n    account="${d.account}" period="${d.period}" (${d.bytes} bytes)`,
    );
    const acctId = d.accountIds?.[0];
    if (acctId) {
      const [a] = await db
        .select({ name: accounts.displayName, number: accounts.accountNumber, type: accounts.type })
        .from(accounts)
        .where(eq(accounts.id, acctId));
      if (a) console.log(`    → matched account: "${a.name}" (#${a.number ?? '—'}, ${a.type})`);
    }
  }

  const [summary] = await db
    .select({
      n: sql<number>`count(*)::int`,
      accts: sql<number>`count(distinct ${transactions.accountId})::int`,
      minDate: sql<string>`min(${transactions.date})::text`,
      maxDate: sql<string>`max(${transactions.date})::text`,
      sum: sql<string>`coalesce(sum(${transactions.amount}),0)::text`,
      inflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} > 0),0)::text`,
      outflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.amount} < 0),0)::text`,
      needsReview: sql<number>`count(*) filter (where ${transactions.needsReview})::int`,
    })
    .from(transactions);

  console.log('\n=== transactions (whole DB — should be just this upload) ===');
  console.log(`  total=${summary!.n}  accounts=${summary!.accts}  needsReview=${summary!.needsReview}`);
  console.log(`  dates: ${summary!.minDate} → ${summary!.maxDate}`);
  console.log(`  inflow=+${summary!.inflow}  outflow=${summary!.outflow}  net=${summary!.sum}`);

  const sample = await db
    .select({ date: transactions.date, merchant: transactions.merchant, raw: transactions.rawDescription, amount: transactions.amount })
    .from(transactions)
    .orderBy(transactions.date)
    .limit(8);
  console.log('\n=== first 8 rows (by date) ===');
  for (const r of sample) {
    console.log(`  ${r.date}  ${String(r.amount).padStart(10)}  ${r.merchant ?? r.raw}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
