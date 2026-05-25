import { Sidebar } from '@/components/Sidebar';
import { loadStubs } from '@/lib/payroll/load';
import { PayrollClient } from './PayrollClient';
import './payroll.css';

export const metadata = { title: 'Payroll · Vault' };
export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  const stubs = await loadStubs();
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="payroll-page w-full max-w-[1600px] px-12 pt-6 pb-12">
          <PayrollClient stubs={stubs} />
        </main>
      </div>
    </div>
  );
}
