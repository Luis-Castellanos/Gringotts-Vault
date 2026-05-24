import { Sidebar } from '@/components/Sidebar';
import { PayrollClient } from './PayrollClient';
import './payroll.css';

export const metadata = { title: 'Payroll · Vault' };

export default function PayrollPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="payroll-page w-full max-w-[1600px] px-12 pt-10 pb-20">
          <PayrollClient />
        </main>
      </div>
    </div>
  );
}
