import { PageShell } from '@/components/PageShell';
import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="form" className="account-detail-page">
      <GenericPageSkeleton tiles={2} />
    </PageShell>
  );
}
