import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeInitScript } from '@/lib/theme';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';
import { DemoBanner } from '@/components/DemoBanner';
import type { ProfileData } from '@/lib/profile/avatars';

export const metadata: Metadata = {
  title: 'Vault',
  description: 'Personal finance, the way you actually think about money.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

async function loadInitialProfile(): Promise<ProfileData | null> {
  try {
    const { getProfile } = await import('@/lib/profile/load');
    return await getProfile();
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialProfile = await loadInitialProfile();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <TopBar />
        <div className="flex min-h-[calc(100vh_-_44px)]">
          <Sidebar initialProfile={initialProfile} />
          <div className="min-w-0 flex-1 flex justify-center">
            {children}
          </div>
        </div>
        <DemoBanner />
      </body>
    </html>
  );
}
