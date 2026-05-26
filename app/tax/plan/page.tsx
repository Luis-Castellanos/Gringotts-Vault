import { SUPPORTED_YEARS } from '@/lib/tax-engine';
import { loadWorkspace, resolveTaxYear } from '@/lib/tax/workspace-store';
import { PlanClient } from './PlanClient';

export const metadata = { title: 'Tax · Plan · Vault' };
export const dynamic = 'force-dynamic';

export default async function TaxPlanPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const y = resolveTaxYear(year ? Number(year) : new Date().getFullYear());
  const ws = await loadWorkspace(y);
  return (
    <main className="w-full max-w-[1100px] px-10 pt-6 pb-20">
      <PlanClient key={y} initialWorkspace={ws} year={y} supportedYears={SUPPORTED_YEARS} />
    </main>
  );
}
