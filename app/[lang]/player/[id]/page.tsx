import { PlayerDetail, PlayerResult } from '@/lib/api';
import { getScrapedData } from '@/lib/db-utils';
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
    const [player, results] = await Promise.all([
      getScrapedData<PlayerDetail>('player_detail', playerId),
      getScrapedData<PlayerResult[]>('player_results', playerId),
    ]);

    if (!player) {
      throw new Error(`Player data for ID ${playerId} not found in database. Please run the scraping job.`);
    }

    const fullName = `${player.firstName} ${player.lastName}`;
    const totalFaults = results?.reduce((acc, result) => acc + (result.faults || 0), 0) || 0;

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
                : 0 €
                {' '}
                <span className="text-sm">
                  (
                  {dict.playerDetail.unpaid}
                  : 0 €)
                </span>
              </p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {results && results.length > 0 ? (
                  results.map((result, index) => (
                    <TableRow key={result.match?.id || index}>
                      <TableCell className="whitespace-nowrap">
                        {result.match?.date ? new Date(result.match.date).toLocaleDateString() : '-'}
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
                      <TableCell className="text-right">{result.faults ?? '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
