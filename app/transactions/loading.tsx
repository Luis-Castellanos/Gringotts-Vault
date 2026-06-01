import { PageShell } from '@/components/PageShell';
import { Skeleton } from '@/components/Skeleton';
import './transactions.css';

// Mirrors the real Transactions layout: a sticky toolbar over date-grouped rows
// (avatar + merchant/sub-line + amount), so nothing shifts when data lands.
export default function Loading() {
  return (
    <PageShell variant="dense" className="transactions-page">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-9 w-72 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {Array.from({ length: 3 }).map((_, g) => (
        <div key={g} className="mb-7">
          <Skeleton className="h-4 w-32 mb-3 opacity-60" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/5 opacity-60" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageShell>
  );
}
