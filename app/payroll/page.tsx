import { loadStubs } from '@/lib/payroll/load';
import { PayrollClient } from './PayrollClient';
import './payroll.css';

export const metadata = { title: 'Payroll · Vault' };
export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  const stubs = await loadStubs();
  return (
    <main className="payroll-page w-full max-w-[1600px] px-12 pt-6 pb-12">
      <PayrollClient stubs={stubs} />
    </main>
  );
}
