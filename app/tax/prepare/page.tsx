import { PageShell } from '@/components/PageShell';
import { SUPPORTED_YEARS } from '@/lib/tax-engine';
import { loadWorkspace, resolveTaxYear } from '@/lib/tax/workspace-store';
import { PrepareClient } from './PrepareClient';

export const metadata = { title: 'Tax · Prepare · Vault' };
export const dynamic = 'force-dynamic';

export default async function TaxPreparePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const y = resolveTaxYear(year ? Number(year) : new Date().getFullYear());
  const ws = await loadWorkspace(y);
  return (
    <PageShell variant="form">
      <PrepareClient key={y} initialWorkspace={ws} year={y} supportedYears={SUPPORTED_YEARS} />
    </PageShell>
  );
}
