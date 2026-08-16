import { redirect } from 'next/navigation';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSession } from '@/lib/session';
import { listCredentialsForUser } from '@/lib/webauthn';
import { formatDateOnly } from '@/lib/dates';
import { PasskeyManager } from '@/components/settings/PasskeyManager';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg space-y-4';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function SettingsPage({ params }: PageProps) {
  const { lang: langParam } = await params;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const t = dict.settings;

  const session = await getSession();
  if (!session?.user.id) redirect(`/${lang}/sign-in`);

  const credentials = await listCredentialsForUser(session.user.id);

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <section className={SECTION}>
        <div>
          <h2 className={SECTION_TITLE}>{t.passkeysTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.passkeysDescription}</p>
        </div>
        <PasskeyManager
          passkeys={credentials.map((credential) => ({
            id: credential.id,
            label: credential.label,
            createdAt: credential.createdAt
              ? formatDateOnly(credential.createdAt.toISOString(), lang)
              : null,
            lastUsedAt: credential.lastUsedAt
              ? formatDateOnly(credential.lastUsedAt.toISOString(), lang)
              : null,
          }))}
          translations={{
            addPasskey: t.addPasskey,
            addingPasskey: t.addingPasskey,
            addTitle: t.addTitle,
            addDescription: t.addDescription,
            labelLabel: t.labelLabel,
            labelPlaceholder: t.labelPlaceholder,
            empty: t.empty,
            unsupported: t.unsupported,
            created: t.created,
            lastUsed: t.lastUsed,
            neverUsed: t.neverUsed,
            deleteLabel: t.deleteLabel,
            deleteTitle: t.deleteTitle,
            deleteDescription: t.deleteDescription,
            cancel: dict.common.cancel,
            errors: t.errors,
          }}
        />
      </section>
    </div>
  );
}
