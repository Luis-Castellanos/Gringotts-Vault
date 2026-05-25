import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <main className="w-full max-w-[1600px] px-12 pt-6 pb-12">
      <GenericPageSkeleton tiles={4} />
    </main>
  );
}
