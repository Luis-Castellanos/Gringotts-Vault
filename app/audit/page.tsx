import { loadStatementAudit } from '@/lib/audit/load';
import { AuditClient } from './AuditClient';

export const metadata = { title: 'Statement Audit · Vault' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const data = await loadStatementAudit();
  return (
    <main className="w-full max-w-[1300px] px-10 pt-8 pb-20">
      <AuditClient data={data} />
    </main>
  );
}
