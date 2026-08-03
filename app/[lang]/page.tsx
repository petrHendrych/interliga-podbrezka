import Link from 'next/link';
import {
  Home as HomeIcon,
  Bus,
  Crown,
  AlertTriangle,
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
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';

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
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
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
  const nextHomeMatch = isCurrent ? (data?.nextHomeMatch || null) : null;

  const hasNoData = !data
    || (upcomingMatches.length === 0
      && !data.hasFinishedMatches
      && players.length === 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {upcomingMatches.length > 0 && (
        <div className="flex flex-col gap-6 mb-8">
          {upcomingMatches.map((match) => {
            const { isHome } = match;
            const opponentName = isHome ? match.awayName : match.homeName;

            return (
              <div
                key={match.id}
                className="border-[3px] border-amber-500 rounded-xl relative bg-card text-card-foreground p-6 shadow-sm"
              >
                <div className="absolute -top-3.5 left-6 bg-background px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500 rounded-md z-10">
                  {interpolate(dict.home.roundFormat, { round: match.round })}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        {dict.home.upcomingMatch}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {isHome ? dict.home.homeMatch : dict.home.awayMatch}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                      {dict.home.vs}
                      {' '}
                      {opponentName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {formatMatchDate(match.startDate, lang)}
                    </p>
                  </div>

                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    {isHome ? <HomeIcon className="w-6 h-6" /> : <Bus className="w-6 h-6" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {bankBalance && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{dict.home.bank.actualBalance}</p>
                <p className={`text-3xl font-bold ${bankBalance.actual < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {bankBalance.actual.toFixed(2)}
                  {' '}
                  €
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{dict.home.bank.grandTotal}</p>
                <p className={`text-3xl font-bold ${bankBalance.total < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {bankBalance.total.toFixed(2)}
                  {' '}
                  €
                </p>
              </div>
            </div>

            {nextHomeMatch && (
              <div className="mt-6 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">
                  {interpolate(
                    dict.home.bank.nextPickup,
                    { date: formatDateOnly(nextHomeMatch.startDate, lang) },
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(upcomingMatches.length > 0 || bankBalance)
        && (players.length > 0 || trainers.length > 0) && (
        <Separator className="my-8" />
      )}

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

      {hasNoData ? (
        <div className="mt-6 p-8 text-center border rounded-lg bg-card text-muted-foreground">
          <p>
            {dict.home.noResults}
            {' '}
            {TEAM_ID}
          </p>
        </div>
      ) : (
        (players.length > 0 || trainers.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {trainers.map((trainer) => (
              <div
                key={trainer.id}
                className="md:col-span-2"
              >
                <Card className="relative overflow-hidden border-amber-500/50 bg-amber-50/5 dark:bg-amber-950/5 h-full">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                      <Avatar className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl after:rounded-2xl shrink-0 border-2 border-amber-200 dark:border-amber-900">
                        <AvatarImage
                          src="/players/3009.JPG"
                          alt={trainer.name}
                          className="rounded-2xl"
                        />
                        <AvatarFallback className="rounded-2xl text-lg font-semibold">
                          {trainer.name.split(' ').map((n) => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 w-full text-center sm:text-left">
                        <h2 className="font-bold text-lg sm:text-xl leading-snug">
                          {trainer.name}
                        </h2>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/60">
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.count3800}
                            </span>
                            <span className="text-base font-bold">
                              {trainer.stats.count3800}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.count3900}
                            </span>
                            <span className="text-base font-bold">
                              {trainer.stats.count3900}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.zeroMisses}
                            </span>
                            <span className="text-base font-semibold">
                              {trainer.stats.zeroMisses}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.totalPaid}
                            </span>
                            <span className="text-base font-semibold">
                              {trainer.stats.totalPaid}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
            {players.map((player, index) => (
              <Link
                key={player.id}
                href={`/${lang}/player/${player.id}?season=${selectedSeasonId}&league=${selectedLeagueKey}`}
                className="block transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                <Card className="relative overflow-hidden hover:border-primary transition-colors h-full">
                  {index === 0 && (
                    <Crown className="w-5 h-5 text-amber-500 fill-amber-400 rotate-12 absolute top-3.5 right-3.5 z-10" />
                  )}
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                      <Avatar className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl after:rounded-2xl shrink-0 border-2 border-muted">
                        <AvatarImage
                          src="/players/3009.JPG"
                          alt={`${player.firstName} ${player.lastName}`}
                          className="rounded-2xl"
                        />
                        <AvatarFallback className="rounded-2xl text-lg font-semibold">
                          {player.firstName?.[0]}
                          {player.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 w-full text-center sm:text-left">
                        <h2 className="font-bold text-lg sm:text-xl leading-snug">
                          {player.firstName}
                          {' '}
                          {player.lastName}
                          {' '}
                          <span className="text-muted-foreground font-normal text-base">
                            (
                            {player.stats.matchesCount}
                            )
                          </span>
                        </h2>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/60">
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.avg}
                            </span>
                            <span className="text-base font-bold text-primary">
                              {player.stats.avg || '-'}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.max}
                            </span>
                            <span className="text-base font-bold">
                              {player.stats.max || '-'}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.misses}
                            </span>
                            <span className="text-base font-semibold">
                              {player.stats.misses}
                            </span>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2 text-center">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                              {dict.home.totalPaid}
                            </span>
                            <span className="text-base font-semibold">
                              {player.stats.totalPaid}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
