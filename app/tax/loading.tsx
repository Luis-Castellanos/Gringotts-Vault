import { PageShell } from '@/components/PageShell';
import { Skeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="form">
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-72 opacity-60" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    </PageShell>
  );
}
