import { PageShell } from '@/components/PageShell';
import { loadTaxSummary, loadTaxYears } from '@/lib/tax/load';
import { TaxClient } from './TaxClient';

export const metadata = { title: 'Tax · Vault' };
export const dynamic = 'force-dynamic';

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const years = await loadTaxYears();
  const selected = year && years.includes(Number(year)) ? Number(year) : years[0]!;
  const summary = await loadTaxSummary(selected);
  return (
    <PageShell variant="form">
      <TaxClient years={years} summary={summary} />
    </PageShell>
  );
}
