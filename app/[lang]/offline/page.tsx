import { WifiOff } from 'lucide-react';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { RetryButton } from './RetryButton';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function OfflinePage({ params }: PageProps) {
  const { lang: langParam } = await params;
  const dict = await getDictionary(langParam as Locale);
  const t = dict.pwa;

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl bg-surface p-6 text-center shadow-lift-lg sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-2">
          <WifiOff className="size-6 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">{t.offlineTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.offlineDescription}</p>
        <RetryButton label={t.retry} />
      </div>
    </div>
  );
}
