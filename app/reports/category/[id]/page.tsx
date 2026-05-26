import { notFound } from 'next/navigation';

import { loadCategoryDetail, loadReportYears } from '@/lib/reports/load';
import { CategoryDetailClient } from './CategoryDetailClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Category · Reports · Vault' };

export default async function CategoryDeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let from = sp.from ?? '';
  let to = sp.to ?? '';
  if (!from || !to) {
    const years = await loadReportYears();
    const y = years[0] ?? new Date().getFullYear();
    from = `${y}-01-01`;
    to = `${y}-12-31`;
  }
  const detail = await loadCategoryDetail(id, from, to);
  if (!detail) notFound();

  return (
    <main className="w-full max-w-[1000px] px-10 pt-6 pb-20">
      <CategoryDetailClient detail={detail} from={from} to={to} />
    </main>
  );
}
