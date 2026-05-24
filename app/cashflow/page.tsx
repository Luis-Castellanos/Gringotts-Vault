import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Cashflow · Vault' };

export default function CashflowPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Cashflow"
            description="Income vs spending over time — by category, by month, drillable. The page that answers 'where is the money going?'"
            features={[
              'Income vs spending bar chart, monthly, with running average',
              'Category breakdown — top outflow categories with drill-down to transactions',
              'Year-over-year comparison (same month last year)',
              'Fixed vs variable classification toggle',
              'Filter by account, date range, exclude transfers (default)',
              'Depends on the flow-type taxonomy migration (Phase 2 data layer)',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
