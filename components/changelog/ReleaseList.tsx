import { formatDateOnly } from '@/lib/dates';
import { interpolate, type Locale } from '@/lib/i18n/config';
import type { ChangelogType, ReleaseView } from '@/lib/changelog/types';

export interface ReleaseListTranslations {
  releaseHeader: string;
  types: Record<ChangelogType, string>;
}

interface ReleaseListProps {
  releases: ReleaseView[];
  lang: Locale;
  translations: ReleaseListTranslations;
}

export function ReleaseList({ releases, lang, translations }: ReleaseListProps) {
  return (
    <div className="space-y-6">
      {releases.map((release) => (
        <section key={release.id} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {interpolate(translations.releaseHeader, {
              version: release.version,
              date: formatDateOnly(release.releasedAt, lang),
            })}
          </h3>
          {release.groups.map((group) => (
            <div key={group.type} className="space-y-1.5">
              <h4 className="font-bold">{translations.types[group.type]}</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
