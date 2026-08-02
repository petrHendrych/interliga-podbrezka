import { unstable_cache } from 'next/cache';
import {
  MatchListItem,
  TeamResult,
  MatchDetail,
  PlayerDetail,
  TEAM_ID,
} from '@/lib/api';
import {
  getTrainersWithStats,
  getPlayerBalances,
  getTeamBankBalance,
  getMatchesByTeamId,
} from '@/lib/db-utils';
import { DEFAULT_SEASON_ID, getLeagueConfig, getTeamIdsForSeason } from '@/lib/season-config';

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

export interface FetchDataResult {
  upcomingMatches: MatchListItem[];
  upcomingMatch: MatchListItem | null;
  teamResults: TeamResult[];
  latestMatch: TeamResult | null;
  matchDetail: MatchDetail | null;
  players: PlayerWithStats[];
  trainers: TrainerWithStats[];
  bankBalance: { actual: number; total: number } | null;
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
  const bankBalance = await getTeamBankBalance(seasonId);

  const effectiveTeamId = leagueKey !== 'all'
    ? (getLeagueConfig(seasonId, leagueKey)?.teamId || teamId)
    : (getTeamIdsForSeason(seasonId)[0] || teamId);

  // 1. Fetch match list from database
  const matchList = await getMatchesByTeamId(effectiveTeamId, seasonId);
  let upcomingMatches: MatchListItem[] = [];
  let nextHomeMatch: MatchListItem | null = null;
  const teamResults: TeamResult[] = [];

  if (matchList && matchList.length > 0) {
    const teamMatches = matchList; // Already filtered by season and includes team info

    // Sort matches by date
    teamMatches.sort((a, b) => {
      const dateA = a.startDate ? parseUtcDate(a.startDate).getTime() : Infinity;
      const dateB = b.startDate ? parseUtcDate(b.startDate).getTime() : Infinity;
      return dateA - dateB;
    });

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

    if (firstUpcomingIdx === -1) {
      // If no upcoming matches, we don't show any in the upcoming section
    } else {
      const firstMatch = teamMatches[firstUpcomingIdx];
      upcomingMatches = [firstMatch];

      const secondMatch = teamMatches[firstUpcomingIdx + 1];
      if (secondMatch && firstMatch.startDate && secondMatch.startDate) {
        if (isNextDay(firstMatch.startDate, secondMatch.startDate)) {
          upcomingMatches.push(secondMatch);
        }
      }
    }

    // Fill teamResults for compatibility (latest matches first)
    const finishedMatches = [...teamMatches]
      .filter((m) => m.teamTotalScore !== null)
      .reverse();

    finishedMatches.forEach((m) => {
      teamResults.push({
        id: m.id,
        matchId: m.id,
        teamId: effectiveTeamId,
        date: m.startDate,
        opponent: m.opponent,
        isHome: m.isHome,
        teamScore: m.teamTotalScore,
        opponentScore: m.opponentTotalScore,
      } as TeamResult);
    });
  }

  const upcomingMatch = upcomingMatches[0] || null;

  // 3. Fetch player details and season results for all players with balance and played matches
  const playerBalances = await getPlayerBalances(seasonId, leagueKey);
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

  const validPlayers = playersWithStats.filter(
    (p): p is PlayerWithStats => p !== null,
  );

  // Sort players by AVG descending
  validPlayers.sort((a, b) => b.stats.avg - a.stats.avg);

  // 7. Fetch trainer data (omit for Slovak Cup UI)
  const trainersData = leagueKey === 'pohar' ? [] : await getTrainersWithStats(seasonId, leagueKey);
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
    upcomingMatch,
    teamResults,
    latestMatch: teamResults[0] || null,
    matchDetail: null,
    players: validPlayers,
    trainers,
    bankBalance,
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
    revalidate: 60,
    tags: ['home-data', 'matches', 'player-balances'],
  },
);
