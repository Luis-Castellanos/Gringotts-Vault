import { loadInvestments } from '@/lib/investments/load';
import { InvestmentsClient } from './InvestmentsClient';

export const metadata = { title: 'Investments · Vault' };
export const dynamic = 'force-dynamic';

export default async function InvestmentsPage() {
  const data = await loadInvestments();
  return (
    <main className="w-full max-w-[1200px] px-10 pt-8 pb-20">
      <InvestmentsClient data={data} />
    </main>
  );
}
