import { Sidebar } from '@/components/Sidebar';
import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Forecasting · Vault' };

export default function ForecastingPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
          <UnderDevelopment
            title="Forecasting"
            description="Projection Labs-style scenario modeling — net worth, retirement, savings rate, what-ifs. Answers 'where am I heading if nothing changes' and 'what changes if I change X?'"
            features={[
              'Net worth projection from current trajectory (10, 20, 40 year horizons)',
              'Retirement readiness — "could I retire at age X with $Y lifestyle?"',
              'Scenario modeling — raise, job change, major purchase, having a kid, paying off the mortgage early',
              'Inflation-adjusted real-dollar projections (vs nominal)',
              'Monte Carlo simulations for market-return uncertainty',
              'Savings-rate sensitivity — "what does +5% savings do over 20 years?"',
              'Goal tracking ("hit $X by Y at current rate")',
              'Projection Labs change-log PDF captured as scoping reference',
            ]}
          />
        </main>
      </div>
    </div>
  );
}
