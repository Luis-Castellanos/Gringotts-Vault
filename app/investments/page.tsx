import { PageShell } from '@/components/PageShell';
import { loadInvestments } from '@/lib/investments/load';
import { InvestmentsClient } from './InvestmentsClient';

export const metadata = { title: 'Investments · Vault' };
export const dynamic = 'force-dynamic';

export default async function InvestmentsPage() {
  const data = await loadInvestments();
  return (
    <PageShell variant="dense">
      <InvestmentsClient data={data} />
    </PageShell>
  );
}
