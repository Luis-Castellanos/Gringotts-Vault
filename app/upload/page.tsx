import { Sidebar } from '@/components/Sidebar';
import { UploadClient } from './UploadClient';

export const metadata = { title: 'Upload · Vault' };

export default function UploadPage() {
  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[900px] px-10 pt-8 pb-20">
          <UploadClient />
        </main>
      </div>
    </div>
  );
}
