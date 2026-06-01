import { PageShell } from '@/components/PageShell';
import { Skeleton } from '@/components/Skeleton';

// Root fallback — primarily the Dashboard skeleton. Data routes have their own
// loading.tsx; static placeholder pages render instantly and never show this.
export default function Loading() {
  return (
    <PageShell variant="dashboard">
      <div className="flex flex-col gap-2 mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56 opacity-60" />
      </div>
      <Skeleton className="h-[180px] w-full rounded-2xl mb-5" />
      <div className="grid grid-cols-3 gap-4 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </PageShell>
  );
}
