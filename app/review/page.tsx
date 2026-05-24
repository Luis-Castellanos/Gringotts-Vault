import { Sidebar } from '@/components/Sidebar';
import { ReviewQueueClient } from './ReviewQueueClient';

export const metadata = {
  title: 'Review · Vault',
};

export default function ReviewPage() {
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      {/* Outer wrapper takes the remaining width; inner container caps at 1600
          and centers. Generous horizontal padding so content never kisses the
          rail edges on narrow viewports. */}
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1500px] px-6 pt-6 pb-16 flex flex-col">
          <ReviewQueueClient />
        </main>
      </div>
    </div>
  );
}