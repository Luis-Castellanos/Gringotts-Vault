import { PageShell } from '@/components/PageShell';
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
    <PageShell variant="form">
      <PlanClient key={y} initialWorkspace={ws} year={y} supportedYears={SUPPORTED_YEARS} />
    </PageShell>
  );
}
