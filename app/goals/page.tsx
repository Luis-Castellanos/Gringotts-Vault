import { loadAllocationOverview, loadDebts, loadGoalAccountOptions, loadGoals } from '@/lib/goals/load';
import { GoalsClient } from './GoalsClient';

export const metadata = { title: 'Goals · Vault' };
export const dynamic = 'force-dynamic';

export default async function GoalsPage() {
  const [goals, accountOptions, debts, allocation] = await Promise.all([
    loadGoals(),
    loadGoalAccountOptions(),
    loadDebts(),
    loadAllocationOverview(),
  ]);
  return (
    <main className="w-full max-w-[1200px] px-10 pt-6 pb-20">
      <GoalsClient goals={goals} accountOptions={accountOptions} debts={debts} allocation={allocation} />
    </main>
  );
}
