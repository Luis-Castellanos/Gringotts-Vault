import { loadInvestments } from '@/lib/investments/load';
import { InvestmentsClient } from './InvestmentsClient';

export const metadata = { title: 'Investments · Vault' };
export const dynamic = 'force-dynamic';

export default async function InvestmentsPage() {
  const data = await loadInvestments();
  return (
    <main className="w-full max-w-[1600px] px-6 pt-6 pb-20 sm:px-10">
      <InvestmentsClient data={data} />
    </main>
  );
}
