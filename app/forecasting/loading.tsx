import { PageShell } from '@/components/PageShell';
import { Skeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="editorial">
      <div className="flex flex-col gap-2 mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 opacity-60" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-24 w-full rounded-xl mb-5" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </PageShell>
  );
}
