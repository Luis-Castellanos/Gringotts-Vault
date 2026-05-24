import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Rental Properties · Vault' };

export default function RentalsPage() {
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Rental Properties"
            description="Treat each property as its own little business — income, expenses, equity, returns. Built so the accountant brain has somewhere to put the property numbers."
            features={[
              'Per-property income (rent) and expenses (mortgage, taxes, insurance, repairs, management fees)',
              'Monthly and annual cash flow per property',
              'Equity built + mortgage payoff progress over time',
              'Depreciation schedule tracking for tax purposes',
              'Return metrics: cap rate, cash-on-cash, total ROI',
              'Tenant info — lease dates, security deposit held, rent escalations',
              'Roll-up across all properties in the portfolio',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
