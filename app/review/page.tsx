import { PageShell } from '@/components/PageShell';
import { ReviewQueueClient } from './ReviewQueueClient';

export const metadata = {
  title: 'Review · Vault',
};

export default function ReviewPage() {
  return (
    <PageShell variant="dense" className="flex flex-col">
      <ReviewQueueClient />
    </PageShell>
  );
}
