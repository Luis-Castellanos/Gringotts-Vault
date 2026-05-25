import { Skeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1300px] px-10 pt-8 pb-20">
      <div className="flex flex-col gap-2 mb-6">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72 opacity-60" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl mb-5" />)}
    </main>
  );
}
