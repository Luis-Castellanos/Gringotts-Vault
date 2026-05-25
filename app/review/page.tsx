import { ReviewQueueClient } from './ReviewQueueClient';

export const metadata = {
  title: 'Review · Vault',
};

export default function ReviewPage() {
  return (
    <main className="w-full max-w-[1500px] px-6 pt-6 pb-16 flex flex-col">
      <ReviewQueueClient />
    </main>
  );
}