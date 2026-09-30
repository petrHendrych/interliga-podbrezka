import { notFound } from 'next/navigation';
import {
  getCachedTrainer,
  getCachedTrainerPaymentRows,
  type TrainerProfile,
} from '@/lib/db-utils';
import {
  buildTrainerMatchRows,
  groupTrainerMatches,
  isUuid,
  summarizeTrainerMatches,
  type TrainerPaymentRow,
} from '@/lib/trainer-matches';
import { TRAINER_SCORE_LIMIT } from '@/lib/money-rules';
import { DEFAULT_SEASON_ID, SEASONS_CONFIG } from '@/lib/season-config';
import { leagueLabelForId } from '@/lib/i18n/league-labels';
import { formatDateOnly } from '@/lib/home-helpers';
import { SeasonLeagueFilter } from '@/components/dashboard/SeasonLeagueFilter';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TrainerMatchAmount, TrainerMatchStatusBadge } from '@/components/money/TrainerMatchPayment';
import { TrainerPaymentSummary } from '@/components/money/TrainerPaymentSummary';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { logPageView } from '@/lib/activity-log';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
  searchParams: Promise<{ season?: string; league?: string }>;
}

export default async function TrainerDetailPage({ params, searchParams }: PageProps) {
  await logPageView();
  const { id, lang: langParam } = await params;
  const { season: seasonParam, league: leagueParam } = await searchParams;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);

  if (!isUuid(id)) notFound();

  const selectedSeasonId = seasonParam ? parseInt(seasonParam, 10) : DEFAULT_SEASON_ID;
  const selectedLeagueKey = leagueParam || 'all';

  let trainer: TrainerProfile | null;
  let paymentRows: TrainerPaymentRow[];
  try {
    [trainer, paymentRows] = await Promise.all([
      getCachedTrainer(id),
      getCachedTrainerPaymentRows(id, selectedSeasonId, selectedLeagueKey),
    ]);
  } catch (error) {
    return (
      <div className="mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold text-destructive">{dict.trainerDetail.errorLoading}</h1>
        <p className="mt-2 text-muted-foreground">
          {error instanceof Error ? error.message : 'An unknown error occurred'}
        </p>
      </div>
    );
  }

  if (!trainer) notFound();

  const matches = groupTrainerMatches(paymentRows);
  const summary = summarizeTrainerMatches(matches);
  const matchRows = buildTrainerMatchRows(matches);

  const matchLabel = (opponent: string | null, isHome: boolean | null) => {
    if (!opponent) return 'Tournament / Other';
    return isHome
      ? interpolate(dict.playerDetail.matchHome, { opponent })
      : interpolate(dict.playerDetail.matchAway, { opponent });
  };

  const paymentLabels = {
    paidStatus: dict.playerDetail.paidStatus,
    unpaidStatus: dict.playerDetail.unpaidStatus,
    partialStatus: dict.trainerDetail.partialStatus,
    conditions: dict.money.conditions,
  };

  return (
    <div className="mx-auto py-8 px-4 max-w-4xl w-full">
      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start mb-8">
        <PlayerAvatar
          name={trainer.name}
          userId={trainer.id}
          className="w-32 h-32 border-2 border-primary shadow-sm"
          fallbackClassName="text-2xl font-bold"
        />
        <div className="flex w-full min-w-0 flex-col items-center gap-4 md:items-start">
          <div className="text-center md:text-left">
            <h1 className="text-3xl font-bold tracking-tight">{trainer.name}</h1>
            <p className="mt-1 text-muted-foreground">{dict.home.trainerLabel}</p>
          </div>
          <TrainerPaymentSummary
            summary={summary}
            labels={{
              totalDue: dict.trainerDetail.totalDue,
              paid: dict.trainerDetail.paid,
              unpaid: dict.trainerDetail.unpaid,
            }}
          />
        </div>
      </div>

      {/* Pinned under the header so switching season/league never moves the control. */}
      <div className="sticky top-[calc(var(--app-header-height)+var(--app-safe-top))] z-30 -mx-4 mt-8 mb-8 border-b bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/60">
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
          <CardTitle>{dict.trainerDetail.paymentsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">{dict.playerDetail.date}</TableHead>
                <TableHead>{dict.playerDetail.league}</TableHead>
                <TableHead className="min-w-[200px]">{dict.playerDetail.match}</TableHead>
                <TableHead className="text-right whitespace-nowrap">{dict.trainerDetail.teamTotal}</TableHead>
                <TableHead className="text-right">{dict.trainerDetail.payment}</TableHead>
                <TableHead className="text-right">{dict.trainerDetail.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matchRows.length > 0 ? (
                matchRows.map((row) => {
                  if (row.kind !== 'result') {
                    const { match } = row;
                    return (
                      <TableRow key={match.matchId} className="text-muted-foreground">
                        <TableCell className="whitespace-nowrap">
                          {match.date ? formatDateOnly(match.date, lang) : '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {leagueLabelForId(match.leagueId, match.leagueName, dict)}
                        </TableCell>
                        <TableCell>{matchLabel(match.opponent, match.isHome)}</TableCell>
                        <TableCell className="text-right">-</TableCell>
                        <TableCell className="text-right">-</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap">
                            {dict.playerDetail.notPlayedYet}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const { match } = row;
                  const isHighScore = match.teamTotalScore !== null
                    && match.teamTotalScore >= TRAINER_SCORE_LIMIT;

                  return (
                    <TableRow key={match.matchId}>
                      <TableCell className="whitespace-nowrap">
                        {match.date ? formatDateOnly(match.date, lang) : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                        {leagueLabelForId(match.leagueId, match.leagueName, dict)}
                      </TableCell>
                      <TableCell>{matchLabel(match.opponent, match.isHome)}</TableCell>
                      <TableCell
                        className={`text-right font-bold tabular-nums ${
                          isHighScore ? 'text-emerald-600 dark:text-emerald-400' : ''
                        }`}
                      >
                        {match.teamTotalScore ?? '-'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <TrainerMatchAmount row={match} labels={paymentLabels} />
                      </TableCell>
                      <TableCell className="text-right">
                        <TrainerMatchStatusBadge row={match} labels={paymentLabels} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {dict.trainerDetail.noResults}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
