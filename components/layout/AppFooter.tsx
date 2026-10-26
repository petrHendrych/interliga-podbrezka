import Link from 'next/link';
import { interpolate, type Locale } from '@/lib/i18n/config';

export function AppFooter({ lang, label }: { lang: Locale; label: string }) {
  return (
    <footer className="px-4 pt-6 pb-[calc(0.75rem+var(--app-safe-bottom))] text-center text-xs text-muted-foreground">
      <Link href={`/${lang}/changelog`} className="underline-offset-4 hover:underline">
        {interpolate(label, { version: process.env.APP_VERSION ?? '' })}
      </Link>
    </footer>
  );
}
