import { Skeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1200px] px-10 pt-8 pb-20">
      <div className="flex flex-col gap-2 mb-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 opacity-60" />
      </div>
      <Skeleton className="h-[300px] w-full rounded-2xl mb-5" />
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </main>
  );
}
