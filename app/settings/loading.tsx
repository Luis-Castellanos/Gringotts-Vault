import { PageShell } from '@/components/PageShell';
import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="form">
      <GenericPageSkeleton tiles={0} />
    </PageShell>
  );
}
