import { PageShell } from '@/components/PageShell';
import { taxFacts } from '@/lib/tax-engine';
import { FiguresClient } from './FiguresClient';

export const metadata = { title: 'Tax · Key figures · Vault' };

export default async function TaxFiguresPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const data = taxFacts(year ? Number(year) : new Date().getFullYear());
  return (
    <PageShell variant="form">
      <FiguresClient data={data} />
    </PageShell>
  );
}
