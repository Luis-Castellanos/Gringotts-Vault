import { PageShell } from '@/components/PageShell';
import { loadStatementAudit } from '@/lib/audit/load';
import { AuditClient } from './AuditClient';

export const metadata = { title: 'Audit · Vault' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const data = await loadStatementAudit();
  return (
    <PageShell variant="dense">
      <AuditClient data={data} />
    </PageShell>
  );
}
