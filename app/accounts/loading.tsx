import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1600px] px-12 pt-8 pb-24">
      <GenericPageSkeleton tiles={0} />
    </main>
  );
}
