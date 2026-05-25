import { UploadClient } from './UploadClient';

export const metadata = { title: 'Upload · Vault' };

export default function UploadPage() {
  return (
    <main className="w-full max-w-[900px] px-10 pt-8 pb-20">
      <UploadClient />
    </main>
  );
}
