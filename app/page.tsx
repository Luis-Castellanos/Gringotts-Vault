import { loadDashboard } from '@/lib/dashboard/load';
import { DashboardClient } from './DashboardClient';

export const metadata = { title: 'Dashboard · Vault' };
export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await loadDashboard();
  return (
    <main className="w-full max-w-[1200px] px-10 pt-6 pb-20">
      <DashboardClient data={data} />
    </main>
  );
}
