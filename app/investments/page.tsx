import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Investments · Vault' };

export default function InvestmentsPage() {
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Investments"
            description="Sophisticated breakdowns of brokerage, retirement, and 401(k) holdings — past Monarch's surface-level view."
            features={[
              'Asset allocation across all investment accounts (stocks / bonds / cash / crypto / real estate)',
              'Performance attribution — top winners and losers, by holding and by category',
              'Fees paid — expense ratios, advisory fees, transaction costs over time',
              'Contributions vs market growth — how much of your balance is yours vs the market\'s',
              'Per-holding detail: cost basis, gain%, dividends, dividend yield',
              'Tax-loss harvesting candidates and wash-sale flags',
              'Portfolio rebalancing suggestions against a target allocation',
              'Brokerage accounts already in schema; functionality not yet built',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
