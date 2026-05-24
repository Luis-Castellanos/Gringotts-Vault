import type { Metadata, Viewport } from 'next';
import './globals.css';
import { themeInitScript } from '@/lib/theme';
import { TopBar } from '@/components/TopBar';

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
        {children}
      </body>
    </html>
  );
}
