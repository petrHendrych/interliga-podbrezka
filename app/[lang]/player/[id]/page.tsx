import {
  getCachedPlayerName,
  getCachedPlayerBalance,
  getCachedPlayerMatchResults,
} from '@/lib/db-utils';
import { DEFAULT_SEASON_ID, SEASONS_CONFIG } from '@/lib/season-config';
import { leagueLabelForId } from '@/lib/i18n/league-labels';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';
import { formatDateOnly } from '@/lib/home-helpers';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { MatchFineTooltip } from '@/components/MatchFineTooltip';
import { Tooltip } from '@/components/ui/tooltip';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
  searchParams: Promise<{ season?: string; league?: string }>;
}

export default async function PlayerDetailPage({ params, searchParams }: PageProps) {
  const { id, lang: langParam } = await params;
  const { season: seasonParam, league: leagueParam } = await searchParams;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const playerId = parseInt(id, 10);

  const selectedSeasonId = seasonParam ? parseInt(seasonParam, 10) : DEFAULT_SEASON_ID;
  const selectedLeagueKey = leagueParam || 'all';

  try {
    // Fetch data from database instead of directly from API
    const [player, balance, matchFines] = await Promise.all([
      getCachedPlayerName(playerId),
      getCachedPlayerBalance(playerId, selectedSeasonId, selectedLeagueKey),
      getCachedPlayerMatchResults(playerId, selectedSeasonId, selectedLeagueKey),
    ]);

    if (!player) {
      throw new Error(`Player data for ID ${playerId} not found in database. Please run the scraping job.`);
    }

    const fullName = `${player.firstName} ${player.lastName}`;
    const totalFaults = matchFines?.reduce((acc, result) => acc + (result.faults || 0), 0) || 0;
    // Only the "all" total carries the success gathering, so that is the one place where
    // breaking it out of the amount says something.
    const showSeasonWideStreakFines = selectedLeagueKey === 'all' && balance.streakFines > 0;

    const fineLabels = {
      paidStatus: dict.playerDetail.paidStatus,
      unpaidStatus: dict.playerDetail.unpaidStatus,
      noFine: dict.playerDetail.noFine,
      reasons: {
        faults: dict.playerDetail.fineReasons.faults,
        worstPlayer: dict.playerDetail.fineReasons.worstPlayer,
        under600: dict.playerDetail.fineReasons.under600,
        teamUnder3750: dict.playerDetail.fineReasons.teamUnder3750,
        fullFaults: dict.playerDetail.fineReasons.fullFaults,
        secondToLastFaults: dict.playerDetail.fineReasons.secondToLastFaults,
        specialFaults: dict.playerDetail.fineReasons.specialFaults,
        streak: dict.playerDetail.fineReasons.streak,
      },
    };

    return (
      <div className="mx-auto py-8 px-4 max-w-4xl w-full">
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start mb-8">
          <PlayerAvatar
            name={fullName}
            externalPlayerId={playerId}
            className="w-32 h-32 border-2 border-primary shadow-sm"
            fallbackClassName="text-2xl font-bold"
          />
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold tracking-tight">
              {fullName}
            </h1>
            <div className="mt-2 text-muted-foreground">
              <p className="text-lg">
                <span className="sm:hidden">
                  {interpolate(dict.playerDetail.totalPaymentShort, { amount: balance.totalPaid })}
                </span>
                <span className="hidden sm:inline">
                  {interpolate(dict.playerDetail.totalPayment, { amount: balance.totalPaid })}
                </span>
                {' '}
                <Tooltip
                  content={(
                    <p className="max-w-[220px] text-[11px]">
                      {interpolate(dict.playerDetail.unpaid, { amount: balance.balance })}
                    </p>
                  )}
                >
                  <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                    <span className="sm:hidden">
                      (
                      {balance.balance}
                      {' €)'}
                    </span>
                    <span className="hidden sm:inline">
                      (
                      {interpolate(dict.playerDetail.unpaid, { amount: balance.balance })}
                      )
                    </span>
                  </span>
                </Tooltip>
              </p>
              {balance.totalBonuses > 0 ? (
                <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                  {interpolate(dict.playerDetail.bonuses, { amount: balance.totalBonuses })}
                </p>
              ) : null}
              <p className="text-sm">
                {interpolate(dict.playerDetail.totalFaults, { count: totalFaults })}
                {showSeasonWideStreakFines ? (
                  <>
                    {', '}
                    <Tooltip
                      content={(
                        <p className="max-w-[220px] text-[11px]">
                          {dict.playerDetail.streakFinesHint}
                        </p>
                      )}
                    >
                      <span className="underline decoration-dotted underline-offset-2">
                        {interpolate(dict.playerDetail.streakFinesCount, {
                          count: balance.streakFinesCount,
                        })}
                      </span>
                    </Tooltip>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </div>

        {/* Pinned under the header so switching season/league never moves the control. */}
        <div className="sticky top-16 z-30 -mx-4 mt-8 mb-8 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60">
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

        <Card>
          <CardHeader>
            <CardTitle>{dict.playerDetail.matchResults}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{dict.playerDetail.date}</TableHead>
                  <TableHead>{dict.playerDetail.league}</TableHead>
                  <TableHead className="min-w-[200px]">{dict.playerDetail.match}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.full}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.clean}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.total}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.faults}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.fine}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchFines && matchFines.length > 0 ? (
                  matchFines.map((result, index) => {
                    const hasFaults = result.faults !== undefined && result.faults !== null;
                    const isStreak5 = Boolean(result.faultlessStreak >= 5);

                    let faultsContent: React.ReactNode = '-';
                    if (hasFaults) {
                      if (isStreak5) {
                        faultsContent = (
                          <span className="font-bold text-red-600 dark:text-red-400">
                            0
                          </span>
                        );
                      } else {
                        faultsContent = <span>{result.faults}</span>;
                      }
                    }

                    let matchName = 'Tournament / Other';
                    if (result.opponent) {
                      matchName = result.isHome
                        ? interpolate(dict.playerDetail.matchHome, { opponent: result.opponent })
                        : interpolate(dict.playerDetail.matchAway, { opponent: result.opponent });
                    }

                    let totalColorClass = '';
                    if (result.total) {
                      if (result.total < 600) {
                        totalColorClass = 'text-red-600 dark:text-red-400';
                      } else if (result.total > 700) {
                        totalColorClass = 'text-emerald-600 dark:text-emerald-400';
                      }
                    }

                    return (
                      <TableRow key={result.matchId || index}>
                        <TableCell className="whitespace-nowrap">
                          {result.date ? formatDateOnly(result.date, lang) : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                          {leagueLabelForId(result.leagueId, result.leagueName, dict)}
                        </TableCell>
                        <TableCell>
                          {matchName}
                        </TableCell>
                        <TableCell className="text-right">{result.full ?? '-'}</TableCell>
                        <TableCell className="text-right">{result.clean ?? '-'}</TableCell>
                        <TableCell className={`text-right font-bold ${totalColorClass}`}>
                          {result.total ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">{faultsContent}</TableCell>
                        <TableCell className="text-right">
                          <MatchFineTooltip
                            calculatedFine={result.calculatedFine}
                            streakFine={result.streakFine}
                            isPaid={result.isPaid}
                            faults={result.faults}
                            isWorstPlayer={result.isWorstPlayer}
                            isUnder600={result.isUnder600}
                            isTeamUnder3750={result.isTeamUnder3750}
                            fullFaultsCount={result.fullFaultsCount}
                            secondToLastFaultsCount={result.secondToLastFaultsCount}
                            specialFaultsCount={result.specialFaultsCount}
                            faultlessStreak={result.faultlessStreak}
                            labels={fineLabels}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {dict.playerDetail.noResults}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    return (
      <div className="mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold text-destructive">{dict.playerDetail.errorLoading}</h1>
        <p className="mt-2 text-muted-foreground">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
      </div>
    );
  }
}
