import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Net Worth · Vault' };

export default function NetWorthPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Net Worth"
            description="Assets vs liabilities over time — the long-view story of where you stand and how it's trending."
            features={[
              'Net worth line chart (multi-year), with assets and liabilities stacked',
              'Account-level detail — drill into any account to see its balance history',
              'Compare periods (1Y, 5Y, all-time)',
              'Annotate milestones (raise, large purchase, loan payoff)',
              'Sub-totals by category (Cash / Investments / Real estate / Loans / Credit cards)',
              'The Accounts page already shows a current-snapshot NW chart — this page goes deeper',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
