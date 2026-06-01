import { notFound } from 'next/navigation';

import { PageShell } from '@/components/PageShell';
import { loadStatementChain } from '@/lib/audit/load';
import { AuditStatementClient } from './AuditStatementClient';

export const metadata = { title: 'Audit · Vault' };
export const dynamic = 'force-dynamic';

export default async function AuditStatementPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const chain = await loadStatementChain(importId);
  if (!chain) notFound();

  return (
    <PageShell variant="dense">
      <AuditStatementClient chain={chain} />
    </PageShell>
  );
}
