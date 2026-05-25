import { UnderDevelopment } from '@/components/UnderDevelopment';

export const metadata = { title: 'Dashboard · Vault' };

export default function Home() {
  return (
    <main className="w-full max-w-[1600px] px-12 pt-10 pb-20">
      <UnderDevelopment
        title="Dashboard"
        description="The default landing page when you open Vault — your at-a-glance view of where things stand."
        features={[
          'Net worth headline + sparkline',
          'Monthly cashflow snapshot (income vs spending this month)',
          'Top spending categories this month',
          'Account balance summary across cash / investments / liabilities',
          'Quick links into Review Queue, Cashflow, Net Worth',
        ]}
      />
    </main>
  );
}
