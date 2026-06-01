import { PageShell } from '@/components/PageShell';
import { loadDashboard } from '@/lib/dashboard/load';
import { DashboardClient } from './DashboardClient';

export const metadata = { title: 'Dashboard · Vault' };
export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await loadDashboard();
  return (
    <PageShell variant="dashboard">
      <DashboardClient data={data} />
    </PageShell>
  );
}
