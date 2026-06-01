import { PageShell } from '@/components/PageShell';
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
    <PageShell variant="form">
      <GoalsClient goals={goals} accountOptions={accountOptions} debts={debts} allocation={allocation} />
    </PageShell>
  );
}
