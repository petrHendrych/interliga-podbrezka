import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { DEFAULT_SEASON_ID, SEASONS_CONFIG } from '@/lib/season-config';
import { getPlayedMatchMoneySummaries } from '@/lib/match-money';
import { formatDateOnly } from '@/lib/home-helpers';
import { leagueLabelForId } from '@/lib/i18n/league-labels';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const COUNT_PILL = 'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-bold tabular-nums';
const MATCH_CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4 transition-colors hover:bg-accent';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const META_ROW = 'flex items-center gap-1.5 text-muted-foreground min-w-0 text-sm';

interface PageProps {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ season?: string; league?: string }>;
}

function AmountChip({ label, amount }: { label: string; amount: number }) {
  const tone = amount > 0
    ? 'text-red-600 dark:text-red-400 font-semibold'
    : 'text-muted-foreground';
  return (
    <div className="rounded-lg bg-surface p-2 text-center">
      <span className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm tabular-nums ${tone}`}>{`${amount} €`}</span>
    </div>
  );
}

export default async function AdminMoneyPage({ params, searchParams }: PageProps) {
  const { lang: langParam } = await params;
  const { season: seasonParam, league: leagueParam } = await searchParams;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const t = dict.admin.money;

  const selectedSeasonId = seasonParam ? parseInt(seasonParam, 10) : DEFAULT_SEASON_ID;
  const selectedLeagueKey = leagueParam || 'all';

  const matches = await getPlayedMatchMoneySummaries(selectedSeasonId, selectedLeagueKey);

  const matchLabel = (opponent: string | null, isHome: boolean | null) => (isHome
    ? interpolate(dict.playerDetail.matchHome, { opponent: opponent ?? '—' })
    : interpolate(dict.playerDetail.matchAway, { opponent: opponent ?? '—' }));

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <div className="sticky top-[calc(var(--app-header-height)+var(--app-safe-top))] z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60 sm:-mx-8 sm:px-8">
        <SeasonLeagueFilter
          seasons={SEASONS_CONFIG}
          selectedSeasonId={selectedSeasonId}
          selectedLeagueKey={selectedLeagueKey}
          labels={{
            seasonLabel: dict.home.season,
            allLeagues: dict.home.filterAll,
            interliga: dict.home.filterInterliga,
            pohar: dict.home.filterPohar,
            turnaje: dict.home.filterTurnaje,
          }}
        />
      </div>

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={SECTION_TITLE}>{t.listTitle}</h2>
          <span className={COUNT_PILL}>{matches.length}</span>
        </div>

        <div className="mt-4">
          {matches.length === 0 ? (
            <p className={EMPTY_STATE}>{t.empty}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {matches.map((match) => (
                <Link
                  key={match.externalId}
                  href={`/${lang}/admin/money/${match.externalId}`}
                  className={MATCH_CARD}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold leading-tight truncate">
                        {matchLabel(match.opponent, match.isHome)}
                      </p>
                      <p className={META_ROW}>
                        <CalendarDays className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {match.date ? formatDateOnly(match.date, lang) : '—'}
                          {' · '}
                          {leagueLabelForId(match.leagueId, match.leagueName, dict)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-bold tabular-nums">
                        {`${match.teamTotalScore ?? '—'} : ${match.opponentTotalScore ?? '—'}`}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <AmountChip label={t.finesUnpaid} amount={match.finesUnpaid} />
                    <AmountChip label={t.bonusesUnpaid} amount={match.bonusesUnpaid} />
                    <AmountChip label={t.trainerUnpaid} amount={match.trainerUnpaid} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
