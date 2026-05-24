import { desc, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accounts, documents } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { FilesClient, type FileRow } from './FilesClient';

export const metadata = { title: 'Files · Vault' };
export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  const docs = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      detectedType: documents.detectedType,
      detectedIssuer: documents.detectedIssuer,
      accountIds: documents.accountIds,
      statementPeriod: documents.statementPeriod,
      status: documents.status,
      transactionCount: documents.transactionCount,
      byteSize: documents.byteSize,
      parseError: documents.parseError,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .orderBy(desc(documents.uploadedAt));

  // Resolve the matched account(s) → institution + last-4 for the Account column.
  const acctIds = [...new Set(docs.flatMap((d) => d.accountIds ?? []))];
  const accts = acctIds.length
    ? await db
        .select({ id: accounts.id, institution: accounts.institution, number: accounts.accountNumber, type: accounts.type })
        .from(accounts)
        .where(inArray(accounts.id, acctIds))
    : [];
  const acctMap = new Map(accts.map((a) => [a.id, a]));

  const rows: FileRow[] = docs.map((d) => {
    const accountId = d.accountIds?.[0] ?? null;
    const acct = accountId ? acctMap.get(accountId) : undefined;
    return {
      id: d.id,
      fileName: d.fileName,
      detectedType: d.detectedType,
      detectedIssuer: d.detectedIssuer,
      statementPeriod: d.statementPeriod,
      status: d.status,
      transactionCount: d.transactionCount,
      byteSize: d.byteSize,
      parseError: d.parseError,
      uploadedAt: d.uploadedAt.toISOString(),
      accountId,
      institution: acct?.institution ?? null,
      last4: acct?.number ?? null,
    };
  });

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1400px] px-10 pt-8 pb-20">
          <FilesClient rows={rows} />
        </main>
      </div>
    </div>
  );
}
