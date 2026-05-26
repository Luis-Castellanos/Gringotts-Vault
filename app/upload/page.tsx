import { UploadClient } from './UploadClient';
import { parserAvailable, PARSER_UNAVAILABLE_MESSAGE } from '@/lib/parser/availability';

export const metadata = { title: 'Upload · Vault' };

export default function UploadPage() {
  const enabled = parserAvailable();
  return (
    <main className="w-full max-w-[900px] px-10 pt-6 pb-20">
      {enabled ? (
        <UploadClient />
      ) : (
        <>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] mb-1">Upload statements</h1>
          <div className="mt-5 rounded-xl border border-border-subtle bg-surface-1 px-5 py-5 text-[13.5px] leading-relaxed text-text-secondary">
            <div className="font-medium text-text-primary mb-1">Uploads run on the desktop app</div>
            {PARSER_UNAVAILABLE_MESSAGE}
          </div>
        </>
      )}
    </main>
  );
}
