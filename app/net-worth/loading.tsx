import { Skeleton } from '@/components/Skeleton';
import './net-worth.css';

// Mirrors Net Worth: hero figure + range toggle, the big area chart, the
// composition bar, then grouped account rows with sparklines.
export default function Loading() {
  return (
    <main className="accounts-page w-full max-w-[1600px] px-12 pt-10 pb-20">
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28 opacity-60" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-40 opacity-60" />
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>

      <Skeleton className="h-[320px] w-full rounded-xl mb-6" />
      <Skeleton className="h-10 w-full rounded-lg mb-8" />

      <div className="flex flex-col gap-7">
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s} className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-40 opacity-60 mb-1" />
            {Array.from({ length: 3 }).map((_, r) => (
              <div key={r} className="flex items-center gap-4">
                <Skeleton className="size-9 rounded-lg shrink-0" />
                <Skeleton className="h-4 w-48" />
                <div className="flex-1" />
                <Skeleton className="h-8 w-24 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
