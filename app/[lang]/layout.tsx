import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Montserrat } from 'next/font/google';
import '../globals.css';
import { Header } from '@/components/layout/Header';
import { BackgroundDots } from '@/components/layout/BackgroundDots';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const montserrat = Montserrat({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
  subsets: ['latin'],
});

// The two colours are the sRGB twins of the `--background` values in app/globals.css; there is
// no way to hand an oklch() to the browser's theme-color, so they are kept in sync by hand.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#020618' },
  ],
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    title: dict.home.pageTitle,
    description: dict.home.pageDescription,
    // Set explicitly rather than relying on Next picking up app/manifest.ts: the root layout
    // sits one segment deeper, at app/[lang]/layout.tsx.
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'Interliga',
      statusBarStyle: 'black-translucent',
    },
    openGraph: {
      type: 'website',
      siteName: 'Interliga Podbrezová',
      title: dict.home.pageTitle,
      description: dict.home.pageDescription,
      locale: lang,
      url: `/${lang}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: dict.home.pageTitle,
      description: dict.home.pageDescription,
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang: langParam } = await params;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BackgroundDots />
          <ServiceWorkerRegistrar />
          <Header lang={lang} />
          <OfflineBanner message={dict.pwa.offlineBanner} />
          <InstallPrompt translations={dict.pwa} />
          <main className="flex flex-1 flex-col pb-[var(--app-safe-bottom)]">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
