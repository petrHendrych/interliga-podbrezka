import { unstable_cache } from 'next/cache';
import { MatchListItem, PlayerDetail, TEAM_ID } from '@/lib/api';
import {
  parseUtcDate, getStartOfBratislavaToday, isNextDay,
} from '@/lib/dates';
import { SYNCED_DATA_REVALIDATE_SECONDS } from '@/lib/cache';
import {
  getTrainersWithStats,
  getPlayerBalances,
  getTeamBankBalance,
  getMatchesByTeamId,
  getUnpaidDebtors,
  getUnpaidBonusReceivers,
  type PlayerSeasonBalance,
  type TeamBankBalance,
  type UnpaidDebtor,
} from '@/lib/db-utils';
import {
  DEFAULT_SEASON_ID,
  TEAM_SCORE_LIMIT,
  TOURNAMENT_FILTER_KEY,
  getLeagueConfig,
  getManualLeagues,
  getTeamIdsForSeason,
  isCurrentSeason,
} from '@/lib/season-config';
import { isUnderLimitEligible } from '@/lib/money-rules';

export interface PlayerStats {
  avg: number;
  max: number;
  misses: number;
  totalPaid: string;
  matchesCount: number;
}

export interface PlayerWithStats extends PlayerDetail {
  stats: PlayerStats;
}

export interface TrainerStats {
  count3800: number;
  count3900: number;
  zeroMisses: number;
  totalPaid: string;
}

export interface TrainerWithStats {
  id: string;
  name: string;
  stats: TrainerStats;
}

export interface TopDonator {
  /** External player id, so the matching card can be flagged without name matching. */
  id: number;
  name: string;
  amount: number;
}

export interface BelowLimitMatch {
  id: number;
  name: string;
  score: number;
}

/** Only players with an external id and a played match belong in the dashboard lists. */
export function eligibleForStats(balances: PlayerSeasonBalance[]): PlayerSeasonBalance[] {
  return balances.filter((b) => b.externalPlayerId !== null && b.matchesCount > 0);
}

/** Dashboard cards, best average first. */
export function toPlayersWithStats(balances: PlayerSeasonBalance[]): PlayerWithStats[] {
  return balances
    .map((b) => ({
      id: b.externalPlayerId!,
      firstName: b.firstName || 'Player',
      lastName: b.lastName || String(b.externalPlayerId),
      stats: {
        avg: b.avgScore,
        max: b.maxScore,
        misses: b.totalFaults,
        totalPaid: `${b.totalDue} €`,
        matchesCount: b.matchesCount,
      },
    }))
    .sort((a, b) => b.stats.avg - a.stats.avg);
}

/** The player who owes the bank the most, or null when nobody owes anything. */
export function pickTopDonator(balances: PlayerSeasonBalance[]): TopDonator | null {
  const [biggestFined] = [...balances]
    .filter((b) => b.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue);

  if (!biggestFined) return null;

  return {
    id: biggestFined.externalPlayerId!,
    name: biggestFined.firstName
      ? `${biggestFined.firstName} ${biggestFined.lastName}`
      : biggestFined.name,
    amount: biggestFined.totalDue,
  };
}

/** Filters whose competition is subject to the rule, so the row belongs on screen at zero too. */
const LIMIT_FILTER_KEYS = new Set<string>(['interliga', TOURNAMENT_FILTER_KEY]);

/** Played matches under the limit, or null when the row does not belong on screen. */
export function collectBelowLimit(
  matches: MatchListItem[],
  leagueKey: string,
): BelowLimitMatch[] | null {
  if (leagueKey === 'pohar') return null;

  const played = matches.filter((m): m is MatchListItem & { teamTotalScore: number } => (
    isUnderLimitEligible(m)
    && typeof m.teamTotalScore === 'number' && m.teamTotalScore > 0
  ));
  if (played.length === 0 && !LIMIT_FILTER_KEYS.has(leagueKey)) return null;

  return played
    .filter((m) => m.teamTotalScore < TEAM_SCORE_LIMIT)
    .map((m) => ({
      id: m.id,
      name: m.isHome ? m.awayName : m.homeName,
      score: m.teamTotalScore,
    }));
}

export interface FetchDataResult {
  upcomingMatches: MatchListItem[];
  hasFinishedMatches: boolean;
  players: PlayerWithStats[];
  trainers: TrainerWithStats[];
  bankBalance: TeamBankBalance | null;
  unpaidDebtors: UnpaidDebtor[];
  unpaidBonusReceivers: UnpaidDebtor[];
  topDonator: TopDonator | null;
  belowLimitMatches: BelowLimitMatch[] | null;
  nextHomeMatch: MatchListItem | null;
}

export {
  parseUtcDate, getStartOfBratislavaToday, isNextDay, formatMatchDate, formatDateOnly,
} from '@/lib/dates';

async function fetchHomeDataInternal(
  teamId: number = TEAM_ID,
  seasonId: number = DEFAULT_SEASON_ID,
  leagueKey: string = 'all',
): Promise<FetchDataResult> {
  const isTournamentFilter = leagueKey === TOURNAMENT_FILTER_KEY;
  const targetLeague = leagueKey !== 'all' && !isTournamentFilter
    ? getLeagueConfig(seasonId, leagueKey)
    : undefined;

  // The tournament tab groups two leagues, so it filters on a list of ids.
  let targetLeagueIds: number[] | undefined;
  if (isTournamentFilter) {
    targetLeagueIds = getManualLeagues(seasonId).map((l) => l.leagueId);
  } else if (targetLeague) {
    targetLeagueIds = [targetLeague.leagueId];
  }

  const effectiveTeamId = targetLeague?.teamIds[0]
    || getTeamIdsForSeason(seasonId)[0]
    || teamId;

  // Independent, and each is its own HTTPS round trip over neon-http.
  const [
    bankBalance,
    matchList,
    playerBalances,
    trainersData,
    unpaidDebtors,
    unpaidBonusReceivers,
  ] = await Promise.all([
    getTeamBankBalance(seasonId, leagueKey),
    getMatchesByTeamId(effectiveTeamId, seasonId, targetLeagueIds, {
      // Fixtures with no league id are unplayed scraped ones, never tournaments.
      includeUnassigned: !isTournamentFilter,
    }),
    getPlayerBalances(seasonId, leagueKey),
    leagueKey === 'pohar' ? [] : getTrainersWithStats(seasonId, leagueKey),
    getUnpaidDebtors(seasonId, leagueKey),
    getUnpaidBonusReceivers(seasonId, leagueKey),
  ]);

  let upcomingMatches: MatchListItem[] = [];
  let nextHomeMatch: MatchListItem | null = null;
  let hasFinishedMatches = false;

  if (matchList && matchList.length > 0) {
    const teamMatches = matchList; // Already filtered by season and includes team info

    // Sort matches by date
    teamMatches.sort((a, b) => {
      const dateA = a.startDate ? parseUtcDate(a.startDate).getTime() : Infinity;
      const dateB = b.startDate ? parseUtcDate(b.startDate).getTime() : Infinity;
      return dateA - dateB;
    });

    if (isCurrentSeason(seasonId)) {
      const now = new Date();
      const startOfToday = getStartOfBratislavaToday(now);

      nextHomeMatch = teamMatches.find(
        (m) => m.isHome
          && m.startDate
          && parseUtcDate(m.startDate) >= startOfToday,
      ) || null;

      const firstUpcomingIdx = teamMatches.findIndex(
        (m) => m.startDate && parseUtcDate(m.startDate) >= startOfToday,
      );

      if (firstUpcomingIdx !== -1) {
        const firstMatch = teamMatches[firstUpcomingIdx];
        upcomingMatches = [firstMatch];

        const secondMatch = teamMatches[firstUpcomingIdx + 1];
        if (secondMatch && firstMatch.startDate && secondMatch.startDate) {
          if (isNextDay(firstMatch.startDate, secondMatch.startDate)) {
            upcomingMatches.push(secondMatch);
          }
        }
      }
    }

    hasFinishedMatches = teamMatches.some((m) => m.teamTotalScore !== null);
  }

  const belowLimitMatches = collectBelowLimit(matchList ?? [], leagueKey);

  const eligibleBalances = eligibleForStats(playerBalances);
  const playersWithStats = toPlayersWithStats(eligibleBalances);
  const topDonator = pickTopDonator(eligibleBalances);

  const trainers: TrainerWithStats[] = trainersData.map((t) => ({
    id: t.id,
    name: t.name,
    stats: {
      count3800: t.count3800,
      count3900: t.count3900,
      zeroMisses: t.zeroMisses,
      totalPaid: t.totalPaid,
    },
  }));

  return {
    upcomingMatches,
    hasFinishedMatches,
    players: playersWithStats,
    trainers,
    bankBalance,
    unpaidDebtors,
    unpaidBonusReceivers,
    topDonator,
    belowLimitMatches,
    nextHomeMatch,
  };
}

export const fetchHomeData = unstable_cache(
  async (
    teamId: number = TEAM_ID,
    seasonId: number = DEFAULT_SEASON_ID,
    leagueKey: string = 'all',
  ): Promise<FetchDataResult> => fetchHomeDataInternal(teamId, seasonId, leagueKey),
  // The key hashes only the arguments, so a changed `FetchDataResult` shape would keep
  // serving payloads missing the new fields. Bump the version whenever that shape changes.
  ['home-data', 'v5'],
  {
    revalidate: SYNCED_DATA_REVALIDATE_SECONDS,
    tags: ['home-data'],
  },
);
