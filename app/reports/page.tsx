import { loadAnnualReport, loadReportYears } from '@/lib/reports/load';
import { ReportsClient } from './ReportsClient';

export const metadata = { title: 'Reports · Vault' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year } = await searchParams;
  const years = await loadReportYears();

  if (years.length === 0) {
    return (
      <main className="w-full max-w-[1200px] px-10 pt-8 pb-20">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Reports</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5 mb-8">Year-end summary — income, spending, and where it went.</p>
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
          No transactions yet. Import statements on the Upload page and your annual summary appears here.
        </div>
      </main>
    );
  }

  const selected = year && years.includes(Number(year)) ? Number(year) : years[0]!;
  const report = await loadAnnualReport(selected);

  return (
    <main className="w-full max-w-[1200px] px-10 pt-8 pb-20">
      <ReportsClient years={years} report={report} />
    </main>
  );
}
