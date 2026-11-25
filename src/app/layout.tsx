import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';

import { Navbar } from '@/components/layout/Navbar';
import { PersistenceProvider } from '@/components/shared/PersistenceProvider';
import { StorageWarningDialog } from '@/components/shared/StorageWarningDialog';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Ted Studio — AI image & video editor',
    template: '%s · Ted Studio',
  },
  description:
    'Erase objects, inpaint from a prompt, cut clips, build videos from stills and score them with music — all in the browser.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Ted Studio — AI image & video editor',
    description: 'AI-powered image and video editing in the browser.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <PersistenceProvider />
        <StorageWarningDialog />
        <div className="flex h-full min-h-screen flex-col">
          <Navbar />
          <main className="flex flex-1 flex-col">{children}</main>
        </div>

        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: 'border-border bg-card text-card-foreground',
            },
          }}
        />
      </body>
    </html>
  );
}
