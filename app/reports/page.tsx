import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Reports · Vault' };

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Reports"
            description="Custom views and exports — your own queries against your own data, saved for re-use."
            features={[
              'Saved queries with parameters (date range, accounts, categories)',
              'Year-end tax summary view (income, deductions, tax withheld by source)',
              'CSV / PDF export of any filtered list',
              'Subscription tracker (auto-detect recurring charges, surface upcoming renewals)',
              'Anomaly detection ("this category is 3× last month")',
              'Long-term — the tax engine work (Phase 5+) builds on this',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
