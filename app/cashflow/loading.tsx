import { Skeleton } from '@/components/Skeleton';
import './cashflow.css';

// Mirrors Cashflow: period toggle, the income/expense bar chart, the four
// summary tiles, then the two-column Income / Expenses breakdown.
export default function Loading() {
  return (
    <main className="cashflow-page w-full max-w-[1400px] px-10 pt-9 pb-20">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>

      <Skeleton className="h-[280px] w-full rounded-xl mb-6" />

      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, c) => (
          <div key={c} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 6 }).map((_, r) => (
              <Skeleton key={r} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
