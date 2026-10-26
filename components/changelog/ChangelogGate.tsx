import { getSession } from '@/lib/session';
import { getDialogReleases } from '@/lib/changelog/releases';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';
import { ChangelogDialog } from './ChangelogDialog';

interface ChangelogGateProps {
  lang: Locale;
  translations: Dictionary['changelog'];
}

export async function ChangelogGate({ lang, translations }: ChangelogGateProps) {
  const session = await getSession();
  if (!session) return null;

  let releases;
  try {
    releases = await getDialogReleases(session.user.id, lang);
  } catch (error) {
    // The dialog is a courtesy; a failing query must never take the whole layout down with it.
    // eslint-disable-next-line no-console
    console.error('Failed to load the changelog:', error);
    return null;
  }
  if (releases.length === 0) return null;

  return <ChangelogDialog releases={releases} lang={lang} translations={translations} />;
}
