import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1400px] px-10 pt-8 pb-20">
      <GenericPageSkeleton tiles={0} />
    </main>
  );
}
