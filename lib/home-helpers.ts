import { unstable_cache } from 'next/cache';
import { MatchListItem, PlayerDetail, TEAM_ID } from '@/lib/api';
import { SYNCED_DATA_REVALIDATE_SECONDS } from '@/lib/cache';
import {
  getTrainersWithStats,
  getPlayerBalances,
  getTeamBankBalance,
  getMatchesByTeamId,
  type TeamBankBalance,
} from '@/lib/db-utils';
import {
  DEFAULT_SEASON_ID,
  INTERLIGA_LEAGUE_IDS,
  TEAM_SCORE_LIMIT,
  TOURNAMENT_FILTER_KEY,
  TOURNAMENT_LEAGUE_IDS,
  getLeagueConfig,
  getManualLeagues,
  getTeamIdsForSeason,
  isCurrentSeason,
} from '@/lib/season-config';

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

function isInterliga(match: MatchListItem): boolean {
  return (match.leagueId !== undefined && INTERLIGA_LEAGUE_IDS.includes(match.leagueId))
    || (match.leagueName?.toLowerCase().includes('interliga') ?? false);
}

function isTournament(match: MatchListItem): boolean {
  return match.leagueId !== undefined && TOURNAMENT_LEAGUE_IDS.includes(match.leagueId);
}

/** Mirrors the `team_under_3750` rule in `recalculateDerivedFinancials`. */
function isUnderLimitEligible(match: MatchListItem): boolean {
  return (isInterliga(match) && Boolean(match.isHome)) || isTournament(match);
}

/** Played matches the limit applies to, or null when the rule cannot apply. */
function countBelowLimit(matches: MatchListItem[]): number | null {
  const played = matches.filter((m): m is MatchListItem & { teamTotalScore: number } => (
    isUnderLimitEligible(m)
    && typeof m.teamTotalScore === 'number' && m.teamTotalScore > 0
  ));
  if (played.length === 0) return null;

  return played.filter((m) => m.teamTotalScore < TEAM_SCORE_LIMIT).length;
}

export interface FetchDataResult {
  upcomingMatches: MatchListItem[];
  hasFinishedMatches: boolean;
  players: PlayerWithStats[];
  trainers: TrainerWithStats[];
  bankBalance: TeamBankBalance | null;
  topDonator: TopDonator | null;
  belowLimit: number | null;
  nextHomeMatch: MatchListItem | null;
}

export function parseUtcDate(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  let iso = dateString.trim().replace(' ', 'T');
  if (!iso.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    iso += 'Z';
  }
  return new Date(iso);
}

export function getStartOfBratislavaToday(now: Date = new Date()): Date {
  const str = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${str}T00:00:00Z`);
}

export function isNextDay(dateString1: string, dateString2: string): boolean {
  const d1 = parseUtcDate(dateString1);
  const d2 = parseUtcDate(dateString2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return false;

  const getBratislavaDateStr = (d: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

  const str1 = getBratislavaDateStr(d1);
  const str2 = getBratislavaDateStr(d2);

  const day1Start = new Date(`${str1}T00:00:00Z`).getTime();
  const day2Start = new Date(`${str2}T00:00:00Z`).getTime();

  const diffInDays = Math.round((day2Start - day1Start) / (1000 * 60 * 60 * 24));
  return diffInDays === 1;
}

export function formatMatchDate(dateString: string, lang: string): string {
  try {
    const date = parseUtcDate(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat(lang, {
      timeZone: 'Europe/Bratislava',
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

export function formatDateOnly(dateString: string, lang: string): string {
  try {
    const date = parseUtcDate(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat(lang, {
      timeZone: 'Europe/Bratislava',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}

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
  const [bankBalance, matchList, playerBalances, trainersData] = await Promise.all([
    getTeamBankBalance(seasonId, leagueKey),
    getMatchesByTeamId(effectiveTeamId, seasonId, targetLeagueIds, {
      // Fixtures with no league id are unplayed scraped ones, never tournaments.
      includeUnassigned: !isTournamentFilter,
    }),
    getPlayerBalances(seasonId, leagueKey),
    leagueKey === 'pohar' ? [] : getTrainersWithStats(seasonId, leagueKey),
  ]);

  let upcomingMatches: MatchListItem[] = [];
  let nextHomeMatch: MatchListItem | null = null;
  let hasFinishedMatches = false;
  let belowLimit: number | null = null;

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
    belowLimit = countBelowLimit(teamMatches);
  }

  const eligibleBalances = playerBalances.filter(
    (b) => b.externalPlayerId !== null && b.matchesCount > 0,
  );

  const playersWithStats = eligibleBalances.map((b) => {
    const totalPaid = `${b.totalDue} €`;

    const player: PlayerWithStats = {
      id: b.externalPlayerId!,
      firstName: b.firstName || 'Player',
      lastName: b.lastName || String(b.externalPlayerId),
      stats: {
        avg: b.avgScore,
        max: b.maxScore,
        misses: b.totalFaults,
        totalPaid,
        matchesCount: b.matchesCount,
      },
    };

    return player;
  });

  // Sort players by AVG descending
  playersWithStats.sort((a, b) => b.stats.avg - a.stats.avg);

  const [biggestFined] = [...eligibleBalances]
    .filter((b) => b.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue);

  const topDonator: TopDonator | null = biggestFined
    ? {
      id: biggestFined.externalPlayerId!,
      name: biggestFined.firstName
        ? `${biggestFined.firstName} ${biggestFined.lastName}`
        : biggestFined.name,
      amount: biggestFined.totalDue,
    }
    : null;

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
    topDonator,
    belowLimit,
    nextHomeMatch,
  };
}

export const fetchHomeData = unstable_cache(
  async (
    teamId: number = TEAM_ID,
    seasonId: number = DEFAULT_SEASON_ID,
    leagueKey: string = 'all',
  ): Promise<FetchDataResult> => fetchHomeDataInternal(teamId, seasonId, leagueKey),
  ['home-data'],
  {
    revalidate: SYNCED_DATA_REVALIDATE_SECONDS,
    tags: ['home-data'],
  },
);
