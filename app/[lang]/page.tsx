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
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Tooltip } from '@/components/ui/tooltip';
import { Locale, interpolate } from '@/lib/i18n/config';
import { pluralize } from '@/lib/i18n/plural';
import { getDictionary } from '@/lib/i18n/dictionaries';

const STAT_TILE = 'rounded-lg bg-surface-2 px-2 py-1.5 sm:p-2 text-center flex flex-col justify-center';
const STAT_LABEL = 'block text-[10px] leading-tight uppercase font-semibold tracking-wide text-muted-foreground';
const STAT_VALUE = 'text-sm sm:text-base leading-tight tabular-nums';
const STAT_GRID = 'grid w-full min-w-0 grid-cols-2 auto-rows-fr sm:grid-cols-4 gap-1.5 sm:gap-2';
const PERSON_CARD = 'rounded-xl bg-surface p-4 sm:p-5 shadow-lift';
const PERSON_BODY = 'flex items-stretch gap-3 sm:gap-4';
/** The avatar sets the card height; the name and the stats stack up beside it. */
const AVATAR = 'w-28 h-28 sm:w-24 sm:h-24 rounded-2xl after:rounded-2xl shrink-0';
const PERSON_MAIN = 'flex flex-1 min-w-0 flex-col justify-between gap-2';
const PERSON_NAME = 'font-bold text-lg sm:text-xl leading-tight truncate';
const PERSON_MATCHES = 'shrink-0 text-xs sm:text-sm font-normal text-muted-foreground tabular-nums';
/** One value per row, so a long name can never push the amount out of the card. */
const BANK_ROW = 'flex items-baseline justify-between gap-3 border-b border-foreground/10 py-3';
const BANK_LABEL = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const BANK_VALUE = 'shrink-0 text-base font-bold tabular-nums';
/** Touch devices get no hover, so a tappable value has to look tappable. */
const HINT = 'cursor-pointer underline decoration-dotted decoration-from-font underline-offset-4';
const TOOLTIP_LIST = 'flex flex-col gap-1 min-w-40';
const TOOLTIP_ROW = 'flex items-baseline justify-between gap-4';

// totalPaid arrives pre-formatted ("12.5 €"), so read the sign back off it:
// someone who is owed money must not be painted as though he owed it.
function fineTone(totalPaid: string): string {
  const amount = parseFloat(totalPaid);
  if (amount > 0) return 'text-red-600 dark:text-red-400';
  if (amount < 0) return 'text-emerald-600 dark:text-emerald-400';
  return '';
}

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
  const unpaidDebtors = data?.unpaidDebtors || [];
  const topDonator = data?.topDonator || null;
  const belowLimitMatches = data?.belowLimitMatches ?? null;
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
                {unpaidDebtors.length > 0 ? (
                  <Tooltip
                    content={(
                      <ul className={TOOLTIP_LIST}>
                        {unpaidDebtors.map((debtor) => (
                          <li key={debtor.name} className={TOOLTIP_ROW}>
                            <span className="truncate">{debtor.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {debtor.amount.toFixed(2)}
                              {' '}
                              €
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  >
                    <span className={HINT}>
                      {bankBalance.unpaid.toFixed(2)}
                      {' '}
                      €
                    </span>
                  </Tooltip>
                ) : (
                  <>
                    {bankBalance.unpaid.toFixed(2)}
                    {' '}
                    €
                  </>
                )}
              </dd>
            </div>

            <div className={BANK_ROW}>
              <dt className={BANK_LABEL}>{dict.home.bank.bonusesTotal}</dt>
              <dd className={BANK_VALUE}>
                {bankBalance.bonusesAwarded.toFixed(2)}
                {' '}
                €
                {/* Awarded minus handed over, i.e. what the bank still owes. */}
                <Tooltip content={dict.home.bank.bonusesToPay}>
                  <span className={`ml-1.5 text-xs font-medium text-muted-foreground ${HINT}`}>
                    (
                    {(bankBalance.bonusesAwarded - bankBalance.bonusesPaid).toFixed(2)}
                    {' '}
                    €)
                  </span>
                </Tooltip>
              </dd>
            </div>

            {topDonator && (
              <div className={BANK_ROW}>
                <dt className={BANK_LABEL}>{dict.home.bank.topDonator}</dt>
                <dd className="flex min-w-0 items-baseline justify-end gap-2">
                  <Tooltip content={topDonator.name}>
                    <span className={`${BANK_VALUE} ${HINT}`}>
                      {topDonator.amount.toFixed(2)}
                      {' '}
                      €
                    </span>
                  </Tooltip>
                </dd>
              </div>
            )}

            {belowLimitMatches !== null && (
              <div className={BANK_ROW}>
                <dt className={BANK_LABEL}>{dict.home.bank.belowLimit}</dt>
                <dd className={`${BANK_VALUE} ${belowLimitMatches.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {belowLimitMatches.length > 0 ? (
                    <Tooltip
                      content={(
                        <ul className={TOOLTIP_LIST}>
                          {belowLimitMatches.map((match) => (
                            <li key={match.id} className={TOOLTIP_ROW}>
                              <span className="truncate">{match.name}</span>
                              <span className="shrink-0 font-semibold tabular-nums">
                                {match.score}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    >
                      <span className={HINT}>
                        {belowLimitMatches.length}
                        x
                      </span>
                    </Tooltip>
                  ) : (
                    <>
                      {belowLimitMatches.length}
                      x
                    </>
                  )}
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
                className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 border-l-[3px] border-sky-500 shadow-lift"
              >
                <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  {isHome ? <HomeIcon className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
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
            turnaje: dict.home.filterTurnaje || 'Turnaje',
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
                  <div className={PERSON_BODY}>
                    <PlayerAvatar
                      name={trainer.name}
                      userId={trainer.id}
                      className={AVATAR}
                      fallbackClassName="text-2xl"
                    />

                    <div className={PERSON_MAIN}>
                      <h2 className={PERSON_NAME}>
                        {trainer.name}
                      </h2>

                      <div className={STAT_GRID}>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.count3800}</span>
                          <span className={`${STAT_VALUE} font-bold`}>
                            {trainer.stats.count3800}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.count3900}</span>
                          <span className={`${STAT_VALUE} font-bold`}>
                            {trainer.stats.count3900}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.zeroMisses}</span>
                          <span className={`${STAT_VALUE} font-semibold`}>
                            {trainer.stats.zeroMisses}
                          </span>
                        </div>
                        <div className={STAT_TILE}>
                          <span className={STAT_LABEL}>{dict.home.totalPaid}</span>
                          <span className={`${STAT_VALUE} font-semibold ${fineTone(trainer.stats.totalPaid)}`}>
                            {trainer.stats.totalPaid}
                          </span>
                        </div>
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
                    <div className={PERSON_BODY}>
                      <PlayerAvatar
                        name={`${player.firstName} ${player.lastName}`}
                        externalPlayerId={player.id}
                        className={AVATAR}
                        fallbackClassName="text-2xl"
                      />

                      <div className={PERSON_MAIN}>
                        <div className={`flex items-baseline gap-1.5 min-w-0 ${titlePad}`}>
                          <h2 className={PERSON_NAME}>
                            {player.firstName}
                            {' '}
                            {player.lastName}
                          </h2>
                          <span className={PERSON_MATCHES}>
                            (
                            {pluralize(lang, player.stats.matchesCount, dict.home.matchesPlayed)}
                            )
                          </span>
                        </div>

                        <div className={STAT_GRID}>
                          <div className={STAT_TILE}>
                            <span className={STAT_LABEL}>{dict.home.avg}</span>
                            <span className={`${STAT_VALUE} font-bold text-primary`}>
                              {player.stats.avg || '-'}
                            </span>
                          </div>
                          <div className={STAT_TILE}>
                            <span className={STAT_LABEL}>{dict.home.max}</span>
                            <span className={`${STAT_VALUE} font-bold`}>
                              {player.stats.max || '-'}
                            </span>
                          </div>
                          <div className={STAT_TILE}>
                            <span className={STAT_LABEL}>{dict.home.misses}</span>
                            <span className={`${STAT_VALUE} font-semibold`}>
                              {player.stats.misses}
                            </span>
                          </div>
                          <div className={STAT_TILE}>
                            <span className={STAT_LABEL}>{dict.home.totalPaid}</span>
                            <span className={`${STAT_VALUE} font-semibold ${fineTone(player.stats.totalPaid)}`}>
                              {player.stats.totalPaid}
                            </span>
                          </div>
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
