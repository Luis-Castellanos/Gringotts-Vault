import { PageShell } from '@/components/PageShell';
import { loadBalanceSheet, loadReport, loadReportYears, loadTopMerchants } from '@/lib/reports/load';
import { resolvePeriod, priorWindow } from '@/lib/reports/period';
import { loadRecurring } from '@/lib/reports/recurring';
import { loadAnomalies } from '@/lib/reports/anomalies';
import { ReportsClient } from './ReportsClient';

export const metadata = { title: 'Reports · Vault' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; year?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const years = await loadReportYears();

  if (years.length === 0) {
    return (
      <PageShell variant="dashboard">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] mb-1">Reports</h1>
        <div className="rounded-2xl border border-dashed border-border-subtle bg-surface-1 px-8 py-16 text-center text-[13px] text-text-tertiary">
          No transactions yet.
        </div>
      </PageShell>
    );
  }

  const latest = years[0]!;
  const period = resolvePeriod(
    { id: sp.period, year: sp.year ? Number(sp.year) : undefined, from: sp.from, to: sp.to },
    latest,
  );
  const prev = priorWindow(period);

  const [report, prevReport, recurring, anomalies, topMerchants, balanceSheet] = await Promise.all([
    loadReport(period.from, period.to, period.label),
    loadReport(prev.from, prev.to, prev.label),
    loadRecurring(),
    loadAnomalies(),
    loadTopMerchants(period.from, period.to),
    loadBalanceSheet(period.to),
  ]);
  // Only treat the prior window as a real comparison when it has data.
  const prevOrNull = prevReport.income + prevReport.spending > 0 ? prevReport : null;

  return (
    <PageShell variant="dashboard">
      <ReportsClient
        years={years}
        period={period}
        report={report}
        prevReport={prevOrNull}
        recurring={recurring}
        anomalies={anomalies}
        topMerchants={topMerchants}
        balanceSheet={balanceSheet}
      />
    </PageShell>
  );
}
