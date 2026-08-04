import Link from 'next/link';
import { CalendarDays, Pencil, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { SEASONS_CONFIG } from '@/lib/season-config';
import {
  getManualMatch,
  listManualMatches,
  listSelectablePlayers,
} from '@/lib/manual-matches';
import { formatDateOnly } from '@/lib/home-helpers';
import { leagueLabelForId, leagueLabelForKey } from '@/lib/i18n/league-labels';
import { ManualMatchForm, type ManualSeasonOption } from './ManualMatchForm';
import { DeleteMatchButton } from './DeleteMatchButton';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const COUNT_PILL = 'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-bold tabular-nums';
const MATCH_CARD = 'flex h-full flex-col gap-3 rounded-xl bg-surface-2 p-4';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const META_ROW = 'flex items-center gap-1.5 text-muted-foreground min-w-0 text-sm';

interface PageProps {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function AdminMatchesPage({ params, searchParams }: PageProps) {
  const { lang: langParam } = await params;
  const { edit } = await searchParams;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const t = dict.admin.matches;

  const editId = edit ? Number.parseInt(edit, 10) : NaN;

  const [manualMatches, players, initial] = await Promise.all([
    listManualMatches(),
    listSelectablePlayers(),
    Number.isNaN(editId) ? Promise.resolve(null) : getManualMatch(editId),
  ]);

  // Only competitions absent from the results API can be entered by hand.
  // Their config names are Slovak, so the label comes from the dictionary.
  const seasons: ManualSeasonOption[] = SEASONS_CONFIG
    .map((season) => ({
      id: season.id,
      name: season.name,
      leagues: season.leagues
        .filter((l) => l.manual)
        .map((l) => ({ leagueId: l.leagueId, name: leagueLabelForKey(l.key, dict) })),
    }))
    .filter((season) => season.leagues.length > 0);

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <ManualMatchForm
        // Remounts on edit so the fields reset to the selected match.
        key={initial?.externalId ?? 'new'}
        lang={lang}
        seasons={seasons}
        players={players}
        initial={initial}
        translations={{
          formTitleCreate: t.formTitleCreate,
          formTitleEdit: t.formTitleEdit,
          season: t.season,
          competition: t.competition,
          date: t.date,
          datePlaceholder: t.datePlaceholder,
          opponent: t.opponent,
          opponentPlaceholder: t.opponentPlaceholder,
          venue: t.venue,
          home: t.home,
          away: t.away,
          opponentTotalScore: t.opponentTotalScore,
          optional: t.optional,
          players: t.players,
          playersHint: t.playersHint,
          player: t.player,
          playerPlaceholder: t.playerPlaceholder,
          full: t.full,
          clean: t.clean,
          total: t.total,
          faults: t.faults,
          addPlayer: t.addPlayer,
          removePlayer: t.removePlayer,
          teamTotal: t.teamTotal,
          save: t.save,
          saving: t.saving,
          cancelEdit: t.cancelEdit,
          errors: t.errors,
        }}
      />

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={SECTION_TITLE}>{t.listTitle}</h2>
          <span className={COUNT_PILL}>{manualMatches.length}</span>
        </div>

        <div className="mt-4">
          {manualMatches.length === 0 ? (
            <p className={EMPTY_STATE}>{t.empty}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {manualMatches.map((match) => (
                <div key={match.externalId} className={MATCH_CARD}>
                  <div className="min-w-0">
                    <p className="font-bold leading-tight truncate">
                      {match.isHome
                        ? interpolate(dict.playerDetail.matchHome, {
                          opponent: match.opponent ?? '—',
                        })
                        : interpolate(dict.playerDetail.matchAway, {
                          opponent: match.opponent ?? '—',
                        })}
                    </p>
                    <p className={META_ROW}>
                      <CalendarDays className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {match.date ? formatDateOnly(match.date, lang) : '—'}
                        {' · '}
                        {leagueLabelForId(match.leagueId, match.leagueName, dict)}
                      </span>
                    </p>
                    <p className={META_ROW}>
                      <Users className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {interpolate(t.playersCount, { count: match.playersCount })}
                      </span>
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-surface p-2 text-center">
                      <dt className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                        {t.teamTotal}
                      </dt>
                      <dd className="text-sm font-bold tabular-nums">
                        {match.teamTotalScore ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-surface p-2 text-center">
                      <dt className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                        {t.opponentTotalScore}
                      </dt>
                      <dd className="text-sm font-bold tabular-nums">
                        {match.opponentTotalScore ?? '—'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      render={(
                        <Link href={`/${lang}/admin/matches?edit=${match.externalId}`} />
                      )}
                    >
                      <Pencil />
                      {t.edit}
                    </Button>
                    <DeleteMatchButton
                      matchId={match.externalId}
                      label={dict.common.delete}
                      title={t.deleteTitle}
                      description={t.deleteDescription}
                      translations={{
                        cancel: dict.common.cancel,
                        delete: dict.common.delete,
                        errors: t.errors,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
