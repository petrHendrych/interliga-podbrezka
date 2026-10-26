import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSession } from '@/lib/session';
import { getAllReleaseViews } from '@/lib/changelog/releases';
import { logPageView } from '@/lib/activity-log';
import { ReleaseList } from '@/components/changelog/ReleaseList';

const HASH = 'font-mono text-muted-foreground mr-2';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return {
    title: dict.changelog.pageTitle,
    description: dict.changelog.pageDescription,
  };
}

export default async function ChangelogPage({ params }: PageProps) {
  await logPageView();
  const { lang: langParam } = await params;
  const lang = langParam as Locale;
  const session = await getSession();
  if (!session) redirect(`/${lang}/sign-in`);

  const dict = await getDictionary(lang);
  const t = dict.changelog;
  const releases = await getAllReleaseViews(session.user.id, lang);

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          <span className={HASH}>#</span>
          {t.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.pageDescription}</p>
      </div>

      <div className="rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg">
        {releases.length > 0
          ? <ReleaseList releases={releases} lang={lang} translations={t} />
          : <p className="text-sm text-muted-foreground">{t.empty}</p>}
      </div>
    </div>
  );
}
