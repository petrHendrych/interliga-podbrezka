import type { Metadata } from 'next';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { RuleList } from '@/components/rules/RuleList';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg space-y-4';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const SECTION_HINT = 'mt-1 text-sm text-muted-foreground';
const HASH = 'font-mono text-muted-foreground mr-2';
const CODE_BLOCK = 'rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed overflow-x-auto';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return {
    title: dict.rules.pageTitle,
    description: dict.rules.pageDescription,
  };
}

export default async function RulesPage({ params }: PageProps) {
  const { lang: langParam } = await params;
  const dict = await getDictionary(langParam as Locale);
  const t = dict.rules;

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-3xl mx-auto w-full">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          <span className={HASH}>#</span>
          {t.title}
        </h1>
        <p className={SECTION_HINT}>{t.subtitle}</p>
      </div>

      <div className={SECTION}>
        <div>
          <h2 className={SECTION_TITLE}>
            <span className={HASH}>##</span>
            {t.player.title}
          </h2>
          <p className={SECTION_HINT}>{t.player.description}</p>
        </div>

        <RuleList label={t.finesLabel} tone="fine" items={t.player.fines} />

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {t.player.faultsFormulaLabel}
          </h3>
          <div className={CODE_BLOCK}>
            {t.player.faultsFormula.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <RuleList label={t.bonusesLabel} tone="bonus" items={t.player.bonuses} />
      </div>

      <div className={SECTION}>
        <div>
          <h2 className={SECTION_TITLE}>
            <span className={HASH}>##</span>
            {t.trainer.title}
          </h2>
          <p className={SECTION_HINT}>{t.trainer.description}</p>
        </div>

        <RuleList label={t.bonusesLabel} tone="bonus" items={t.trainer.bonuses} />
      </div>

      <div className={SECTION}>
        <h2 className={SECTION_TITLE}>
          <span className={HASH}>##</span>
          {t.notes.title}
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {t.notes.items.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
