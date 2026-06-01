import { PageShell } from '@/components/PageShell';
import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="dense">
      <GenericPageSkeleton tiles={0} />
    </PageShell>
  );
}
