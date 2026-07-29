import { PlayerDetail, PlayerResult } from '@/lib/api';
import {
  getScrapedData,
  getPlayerBalanceByExternalId,
  getPlayerMatchResultsByExternalId,
} from '@/lib/db-utils';
import { formatDateOnly } from '@/lib/home-helpers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Locale } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { MatchFineTooltip } from '@/components/MatchFineTooltip';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

export default async function PlayerDetailPage({ params }: PageProps) {
  const { id, lang: langParam } = await params;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const playerId = parseInt(id, 10);

  try {
    // Fetch data from database instead of directly from API
    const [player, results, balance, matchFines] = await Promise.all([
      getScrapedData<PlayerDetail>('player_detail', playerId),
      getScrapedData<PlayerResult[]>('player_results', playerId),
      getPlayerBalanceByExternalId(playerId),
      getPlayerMatchResultsByExternalId(playerId),
    ]);

    if (!player) {
      throw new Error(`Player data for ID ${playerId} not found in database. Please run the scraping job.`);
    }

    const matchFinesMap = new Map(matchFines.map((mf) => [mf.matchId, mf]));
    const fullName = `${player.firstName} ${player.lastName}`;
    const totalFaults = results?.reduce((acc, result) => acc + (result.faults || 0), 0) || 0;

    const fineLabels = {
      paidStatus: dict.playerDetail.paidStatus || 'Zaplatené',
      unpaidStatus: dict.playerDetail.unpaidStatus || 'Nezaplatené',
      noFine: dict.playerDetail.noFine || 'Bez pokuty',
      reasons: {
        faults: dict.playerDetail.fineReasons?.faults || '{count} chýb',
        worstPlayer: dict.playerDetail.fineReasons?.worstPlayer || 'najhorší hráč',
        under600: dict.playerDetail.fineReasons?.under600 || 'pod 600',
        fullFaults: dict.playerDetail.fineReasons?.fullFaults || '{count}x chyba do plných',
        secondToLastFaults: dict.playerDetail.fineReasons?.secondToLastFaults || '{count}x predposledný hod',
        specialFaults: dict.playerDetail.fineReasons?.specialFaults || '{count}x špeciálna chyba',
        streak: dict.playerDetail.fineReasons?.streak || 'séria 5+ zápasov bez chyby ({count}. zápas)',
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
                {dict.playerDetail.totalPayment}
                :
                {' '}
                {balance.totalPaid}
                {' '}
                €
                {' '}
                <span className="text-sm">
                  (
                  {dict.playerDetail.unpaid}
                  :
                  {' '}
                  {balance.balance}
                  {' '}
                  €)
                </span>
              </p>
              {balance.totalBonuses > 0 ? (
                <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400">
                  {dict.playerDetail.bonuses || 'Bonusy'}
                  :
                  {' '}
                  {balance.totalBonuses}
                  {' '}
                  €
                </p>
              ) : null}
              <p className="text-lg">
                {dict.playerDetail.totalFaults}
                :
                {' '}
                {totalFaults}
              </p>
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        <Card>
          <CardHeader>
            <CardTitle>{dict.playerDetail.matchResults}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{dict.playerDetail.date}</TableHead>
                  <TableHead className="min-w-[200px]">{dict.playerDetail.match}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.full}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.clean}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.total}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.faults}</TableHead>
                  <TableHead className="text-right">{dict.playerDetail.fine || 'Pokuta'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results && results.length > 0 ? (
                  results.map((result, index) => {
                    const matchId = result.match?.id;
                    const matchFine = matchId ? matchFinesMap.get(matchId) : undefined;
                    const hasFaults = result.faults !== undefined && result.faults !== null;
                    const isStreak5 = Boolean(matchFine && matchFine.faultlessStreak >= 5);

                    let faultsContent: React.ReactNode = '-';
                    if (hasFaults) {
                      if (isStreak5) {
                        faultsContent = (
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            0 🔥
                          </span>
                        );
                      } else {
                        faultsContent = <span>{result.faults}</span>;
                      }
                    }

                    return (
                      <TableRow key={result.match?.id || index}>
                        <TableCell className="whitespace-nowrap">
                          {result.match?.date ? formatDateOnly(result.match.date, lang) : '-'}
                        </TableCell>
                        <TableCell>
                          {result.match?.homeTeam?.club?.name
                            && result.match?.awayTeam?.club?.name ? (
                              `${result.match.homeTeam.club.name} vs ${result.match.awayTeam.club.name}`
                            ) : (
                              'Tournament / Other'
                            )}
                        </TableCell>
                        <TableCell className="text-right">{result.full ?? '-'}</TableCell>
                        <TableCell className="text-right">{result.clean ?? '-'}</TableCell>
                        <TableCell className="text-right font-bold">{result.total ?? '-'}</TableCell>
                        <TableCell className="text-right">{faultsContent}</TableCell>
                        <TableCell className="text-right">
                          {matchFine ? (
                            <MatchFineTooltip
                              calculatedFine={matchFine.calculatedFine}
                              isPaid={matchFine.isPaid}
                              faults={matchFine.faults}
                              isWorstPlayer={matchFine.isWorstPlayer}
                              isUnder600={matchFine.isUnder600}
                              fullFaultsCount={matchFine.fullFaultsCount}
                              secondToLastFaultsCount={matchFine.secondToLastFaultsCount}
                              specialFaultsCount={matchFine.specialFaultsCount}
                              faultlessStreak={matchFine.faultlessStreak}
                              labels={fineLabels}
                            />
                          ) : (
                            <MatchFineTooltip
                              calculatedFine={0}
                              isPaid={false}
                              faults={result.faults || 0}
                              isWorstPlayer={false}
                              isUnder600={false}
                              fullFaultsCount={0}
                              secondToLastFaultsCount={0}
                              specialFaultsCount={0}
                              labels={fineLabels}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
