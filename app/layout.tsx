import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeInitScript } from '@/lib/theme';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Vault',
  description: 'Personal finance, the way you actually think about money.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <TopBar />
        <div className="flex min-h-[calc(100vh_-_44px)]">
          <Sidebar />
          <div className="flex-1 flex justify-center">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
