import { PageShell } from '@/components/PageShell';
import { GenericPageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageShell variant="dashboard" className="payroll-page">
      <GenericPageSkeleton tiles={4} />
    </PageShell>
  );
}
