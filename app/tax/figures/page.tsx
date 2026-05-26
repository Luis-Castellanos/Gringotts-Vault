import { taxFacts } from '@/lib/tax-engine';
import { FiguresClient } from './FiguresClient';

export const metadata = { title: 'Tax · Key figures · Vault' };

export default async function TaxFiguresPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const data = taxFacts(year ? Number(year) : new Date().getFullYear());
  return (
    <main className="w-full max-w-[1100px] px-10 pt-6 pb-20">
      <FiguresClient data={data} />
    </main>
  );
}
