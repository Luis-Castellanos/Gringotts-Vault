import { Sidebar } from '@/components/Sidebar';
import { ReviewQueueClient } from './ReviewQueueClient';

export const metadata = {
  title: 'Review · Vault',
};

export default function ReviewPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Outer wrapper takes the remaining width; inner container caps at 1600
          and centers. Generous horizontal padding so content never kisses the
          rail edges on narrow viewports. */}
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1600px] px-12 py-10 flex flex-col">
          <ReviewQueueClient />
        </main>
      </div>
    </div>
  );
}