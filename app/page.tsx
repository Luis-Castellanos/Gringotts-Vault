import { loadDashboard } from '@/lib/dashboard/load';
import { DashboardClient } from './DashboardClient';

export const metadata = { title: 'Dashboard · Vault' };
export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await loadDashboard();
  return (
    <main className="w-full max-w-[1440px] px-5 pt-5 pb-20 sm:px-7 lg:px-10">
      <DashboardClient data={data} />
    </main>
  );
}
