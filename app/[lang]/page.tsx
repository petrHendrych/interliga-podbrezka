import Link from 'next/link';
import {
  Home as HomeIcon,
  Bus,
  Crown,
  AlertTriangle,
  Wallet,
  PiggyBank,
} from 'lucide-react';
import { TEAM_ID } from '@/lib/api';
import {
  fetchHomeData,
  formatMatchDate,
  formatDateOnly,
  FetchDataResult,
} from '@/lib/home-helpers';
import { DEFAULT_SEASON_ID, SEASONS_CONFIG, isCurrentSeason } from '@/lib/season-config';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

const STAT_TILE = 'rounded-lg bg-surface-2 p-2 text-center flex flex-col justify-center';
const STAT_LABEL = 'block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground';
const STAT_GRID = 'grid flex-1 min-w-0 grid-cols-2 sm:grid-cols-4 gap-2';
const PERSON_CARD = 'rounded-xl bg-surface p-4 sm:p-5 shadow-lift';
const PERSON_BODY = 'mt-3 flex items-center gap-3 sm:gap-4';
const AVATAR = 'w-20 h-20 rounded-2xl after:rounded-2xl shrink-0';
/** One value per row, so a long name can never push the amount out of the card. */
const BANK_ROW = 'flex items-baseline justify-between gap-3 border-b border-foreground/10 py-3';
const BANK_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const BANK_VALUE = 'shrink-0 text-base font-bold tabular-nums';

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ season?: string; league?: string }>;
}) {
  const { lang: langParam } = await params;
  const { season: seasonParam, league: leagueParam } = await searchParams;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);

  const selectedSeasonId = seasonParam ? parseInt(seasonParam, 10) : DEFAULT_SEASON_ID;
  const selectedLeagueKey = leagueParam || 'all';

  let data: FetchDataResult | null = null;
  let errorMsg: string | null = null;

  try {
    data = await fetchHomeData(TEAM_ID, selectedSeasonId, selectedLeagueKey);
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : 'An unknown error occurred';
  }

  if (errorMsg) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-4 text-red-600">{dict.home.errorTitle}</h1>
        <div className="bg-red-950 border border-red-900 p-4 rounded-lg">
          <p className="text-red-300">{errorMsg}</p>
          <p className="mt-2 text-sm text-red-400">{dict.home.checkToken}</p>
        </div>
      </div>
    );
  }

  const isCurrent = isCurrentSeason(selectedSeasonId);
  const upcomingMatches = isCurrent ? (data?.upcomingMatches || []) : [];
  const players = data?.players || [];
  const trainers = data?.trainers || [];
  const bankBalance = data?.bankBalance || null;
  const topDonator = data?.topDonator || null;
  const belowLimit = data?.belowLimit ?? null;
  const nextHomeMatch = isCurrent ? (data?.nextHomeMatch || null) : null;

  const hasNoData = !data
    || (upcomingMatches.length === 0
      && !data.hasFinishedMatches
      && players.length === 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full">
      {bankBalance && (
        <section className="rounded-2xl bg-surface p-5 sm:p-7 shadow-lift-lg">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="w-4 h-4" />
            <h1 className="text-xs font-semibold uppercase tracking-[0.15em]">
              {dict.home.bank.title}
            </h1>
          </div>

          <p className={`mt-3 text-4xl sm:text-6xl font-bold tabular-nums tracking-tight leading-none ${bankBalance.total < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {bankBalance.total.toFixed(2)}
            {' '}
            €
          </p>

          <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-10 border-t border-foreground/10">
            <div className={BANK_ROW}>
              <dt className={BANK_LABEL}>{dict.home.bank.unpaid}</dt>
              <dd className={`${BANK_VALUE} text-red-600 dark:text-red-400`}>
                {bankBalance.unpaid.toFixed(2)}
                {' '}
                €
              </dd>
            </div>

            <div className={BANK_ROW}>
              <dt className={BANK_LABEL}>{dict.home.bank.paidOut}</dt>
              <dd className={BANK_VALUE}>
                {bankBalance.bonusesAwarded.toFixed(2)}
                {' '}
                €
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  (
                  {bankBalance.bonusesPaid.toFixed(2)}
                  {' '}
                  €)
                </span>
              </dd>
            </div>

            {topDonator && (
              <div className={BANK_ROW}>
                <dt className={BANK_LABEL}>{dict.home.bank.topDonator}</dt>
                <dd className="flex min-w-0 items-baseline justify-end gap-2">
                  <span className="truncate text-sm font-semibold">{topDonator.name}</span>
                  <span className={`${BANK_VALUE} text-red-600 dark:text-red-400`}>
                    {topDonator.amount.toFixed(2)}
                    {' '}
                    €
                  </span>
                </dd>
              </div>
            )}

            {belowLimit !== null && (
              <div className={BANK_ROW}>
                <dt className={BANK_LABEL}>{dict.home.bank.belowLimit}</dt>
                <dd className={`${BANK_VALUE} ${belowLimit > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {belowLimit}
                  x
                </dd>
              </div>
            )}
          </dl>

          {nextHomeMatch && (
            <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-sm font-medium">
                {interpolate(
                  dict.home.bank.nextPickup,
                  { date: formatDateOnly(nextHomeMatch.startDate, lang) },
                )}
              </p>
            </div>
          )}
        </section>
      )}

      {upcomingMatches.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {upcomingMatches.map((match) => {
            const { isHome } = match;
            const opponentName = isHome ? match.awayName : match.homeName;

            return (
              <div
                key={match.id}
                className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 border-l-[3px] border-amber-500 shadow-lift"
              >
                <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {isHome ? <HomeIcon className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      {interpolate(dict.home.roundFormat, { round: match.round })}
                    </span>
                    <span className="text-sm font-bold truncate">
                      {dict.home.vs}
                      {' '}
                      {opponentName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatMatchDate(match.startDate, lang)}
                    {' · '}
                    {isHome ? dict.home.homeMatch : dict.home.awayMatch}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pinned under the header so switching season/league never moves the control. */}
      <div className="sticky top-16 z-30 -mx-4 md:-mx-8 mt-8 mb-8 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md md:px-8">
        <SeasonLeagueFilter
          seasons={SEASONS_CONFIG}
          selectedSeasonId={selectedSeasonId}
          selectedLeagueKey={selectedLeagueKey}
          labels={{
            seasonLabel: dict.home.season || 'Sezóna',
            allLeagues: dict.home.filterAll || 'Všetky',
            interliga: dict.home.filterInterliga || 'Interliga',
            pohar: dict.home.filterPohar || 'Slovenský pohár',
          }}
        />
      </div>

      {/* Keeps the page taller than the viewport so the scrollbar never toggles. */}
      <div className="min-h-[60vh] pb-4">
        {hasNoData ? (
          <div className="rounded-xl bg-surface p-8 text-center text-muted-foreground shadow-lift">
            <p>
              {dict.home.noResults}
              {' '}
              {TEAM_ID}
            </p>
          </div>
        ) : (
          (players.length > 0 || trainers.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-x-10 md:gap-y-8">
              {trainers.map((trainer) => (
                <div
                  key={trainer.id}
                  className={`md:col-span-2 ${PERSON_CARD} ring-1 ring-inset ring-red-800/25`}
                >
                  <h2 className="font-bold text-base sm:text-lg leading-tight truncate">
                    {trainer.name}
                  </h2>

                  <div className={PERSON_BODY}>
                    <Avatar className={AVATAR}>
                      <AvatarImage
                        src="/players/3009.JPG"
                        alt={trainer.name}
                        className="rounded-2xl"
                      />
                      <AvatarFallback className="rounded-2xl bg-surface-2 text-lg font-semibold">
                        {trainer.name.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>

                    <div className={STAT_GRID}>
                      <div className={STAT_TILE}>
                        <span className={STAT_LABEL}>{dict.home.count3800}</span>
                        <span className="text-base font-bold tabular-nums">
                          {trainer.stats.count3800}
                        </span>
                      </div>
                      <div className={STAT_TILE}>
                        <span className={STAT_LABEL}>{dict.home.count3900}</span>
                        <span className="text-base font-bold tabular-nums">
                          {trainer.stats.count3900}
                        </span>
                      </div>
                      <div className={STAT_TILE}>
                        <span className={STAT_LABEL}>{dict.home.zeroMisses}</span>
                        <span className="text-base font-semibold tabular-nums">
                          {trainer.stats.zeroMisses}
                        </span>
                      </div>
                      <div className={STAT_TILE}>
                        <span className={STAT_LABEL}>{dict.home.totalPaid}</span>
                        <span className="text-base font-semibold tabular-nums">
                          {trainer.stats.totalPaid}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {players.map((player, index) => {
                const isTopScorer = index === 0;
                const isTopDonator = topDonator?.id === player.id;
                // Both badges can land on the same card, so the title has to
                // clear one, two, or no icons.
                const titlePad = ['', 'pr-7', 'pr-14'][
                  Number(isTopScorer) + Number(isTopDonator)
                ];
                // totalPaid arrives pre-formatted ("12.5 €"), so read the sign
                // back off it: a player who is owed money must not be painted
                // as though he owed it.
                const fineAmount = parseFloat(player.stats.totalPaid);
                let fineTone = '';
                if (fineAmount > 0) fineTone = 'text-red-600 dark:text-red-400';
                else if (fineAmount < 0) fineTone = 'text-emerald-600 dark:text-emerald-400';

                return (
                  <Link
                    key={player.id}
                    href={`/${lang}/player/${player.id}?season=${selectedSeasonId}&league=${selectedLeagueKey}`}
                    className={`relative block ${PERSON_CARD} ring-1 ring-inset ring-transparent transition-[box-shadow,transform] hover:shadow-lift-lg hover:ring-foreground/15 active:scale-[0.99]`}
                  >
                    {(isTopScorer || isTopDonator) && (
                      <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5">
                        {isTopDonator && (
                          <PiggyBank
                            role="img"
                            aria-label={dict.home.bank.topDonator}
                            className="w-5 h-5 text-emerald-600 dark:text-emerald-400 rotate-12"
                          />
                        )}
                        {isTopScorer && (
                          <Crown className="w-5 h-5 text-amber-500 fill-amber-400 rotate-12" />
                        )}
                      </div>
                    )}
                    <div className={`flex items-baseline gap-1.5 min-w-0 ${titlePad}`}>
                      <h2 className="font-bold text-base sm:text-lg leading-tight truncate">
                        {player.firstName}
                        {' '}
                        {player.lastName}
                      </h2>
                      <span className="shrink-0 text-sm font-normal text-muted-foreground tabular-nums">
                        (
                        {player.stats.matchesCount}
                        )
                      </span>
                    </div>

                    <div className={PERSON_BODY}>
                      <Avatar className={AVATAR}>
                        <AvatarImage
                          src="/players/3009.JPG"
                          alt={`${player.firstName} ${player.lastName}`}
                          className="rounded-2xl"
                        />
                        <AvatarFallback className="rounded-2xl bg-surface-2 text-lg font-semibold">
                          {player.firstName?.[0]}
                          {player.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className={STAT_GRID}>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.avg}</span>
                          <span className="text-base font-bold tabular-nums text-primary">
                            {player.stats.avg || '-'}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.max}</span>
                          <span className="text-base font-bold tabular-nums">
                            {player.stats.max || '-'}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.misses}</span>
                          <span className="text-base font-semibold tabular-nums">
                            {player.stats.misses}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.totalPaid}</span>
                          <span className={`text-base font-semibold tabular-nums ${fineTone}`}>
                            {player.stats.totalPaid}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
