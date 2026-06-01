import { PageShell } from '@/components/PageShell';
import { loadStubs } from '@/lib/payroll/load';
import { PayrollClient } from './PayrollClient';
import './payroll.css';

export const metadata = { title: 'Payroll · Vault' };
export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  const stubs = await loadStubs();
  return (
    <PageShell variant="dashboard" className="payroll-page">
      <PayrollClient stubs={stubs} />
    </PageShell>
  );
}
