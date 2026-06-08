import type { Metadata } from 'next';
import { Geist, Geist_Mono, Audiowide } from 'next/font/google';
import '../globals.css';
import { Header } from '@/components/layout/Header';
import { ThemeProvider } from '@/components/ThemeProvider';
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

const audiowide = Audiowide({
  weight: '400',
  variable: '--font-audiowide',
  subsets: ['latin'],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return {
    title: dict.home.pageTitle,
    description: dict.home.pageDescription,
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

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} ${audiowide.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header lang={lang} />
          <main className="flex flex-1 flex-col">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
