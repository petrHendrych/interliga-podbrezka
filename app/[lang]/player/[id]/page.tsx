import {
  getCachedPlayerName,
  getCachedPlayerBalance,
  getCachedPlayerMatchResults,
} from '@/lib/db-utils';
import { DEFAULT_SEASON_ID, SEASONS_CONFIG } from '@/lib/season-config';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';
import { formatDateOnly } from '@/lib/home-helpers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { MatchFineTooltip } from '@/components/MatchFineTooltip';

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
          <Avatar className="w-32 h-32 rounded-2xl after:rounded-2xl border-2 border-primary shadow-sm">
            <AvatarImage src="/players/3009.JPG" alt={fullName} className="rounded-2xl aspect-square object-cover" />
            <AvatarFallback className="rounded-2xl text-2xl font-bold">
              {player.firstName?.[0]}
              {player.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold tracking-tight">
              {fullName}
            </h1>
            <div className="mt-2 text-muted-foreground">
              <p className="text-lg">
                {interpolate(dict.playerDetail.totalPayment, { amount: balance.totalPaid })}
                {' '}
                <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                  (
                  {interpolate(dict.playerDetail.unpaid, { amount: balance.balance })}
                  )
                </span>
              </p>
              {balance.totalBonuses > 0 ? (
                <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                  {interpolate(dict.playerDetail.bonuses, { amount: balance.totalBonuses })}
                </p>
              ) : null}
              <p className="text-lg">
                {interpolate(dict.playerDetail.totalFaults, { count: totalFaults })}
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        <SeasonLeagueFilter
          className="mb-6 rounded-xl border border-border/80 bg-card p-3 shadow-sm"
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
                          {result.leagueName === 'Interliga'
                            ? (dict.playerDetail.leagueInterliga as string)
                            : (dict.playerDetail.leagueCup as string)}
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
