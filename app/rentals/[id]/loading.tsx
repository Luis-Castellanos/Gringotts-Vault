import { Skeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1100px] px-10 pt-8 pb-20">
      <Skeleton className="h-4 w-28 mb-5 opacity-60" />
      <div className="flex gap-5 mb-7">
        <Skeleton className="h-44 w-72 rounded-xl shrink-0" />
        <div className="flex-1 flex flex-col gap-3">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48 opacity-60" />
          <Skeleton className="h-4 w-80 opacity-60 mt-3" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[360px] w-full rounded-xl" />
    </main>
  );
}
