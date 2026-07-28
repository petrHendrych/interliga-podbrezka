import {
  MatchListItem,
  TeamResult,
  MatchDetail,
  PlayerDetail,
  PlayerResult,
} from '@/lib/api';
import { getScrapedData, getTrainersWithStats } from '@/lib/db-utils';

export interface PlayerStats {
  avg: number;
  max: number;
  misses: number;
  totalPaid: string;
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

export async function fetchHomeData(teamId: number): Promise<FetchDataResult> {
  // 1. Fetch upcoming match list
  let upcomingMatches: MatchListItem[] = [];
  const matchList = await getScrapedData<MatchListItem[]>('match_list', teamId);

  if (matchList && matchList.length > 0) {
    const teamMatches = matchList.filter(
      (m) => m.homeId === teamId || m.awayId === teamId,
    );

    if (teamMatches.length > 0) {
      teamMatches.sort((a, b) => {
        const dateA = parseUtcDate(a.startDate).getTime();
        const dateB = parseUtcDate(b.startDate).getTime();
        if (Number.isNaN(dateA)) return 1;
        if (Number.isNaN(dateB)) return -1;
        return dateA - dateB;
      });

      const now = new Date();
      const startOfToday = getStartOfBratislavaToday(now);

      let firstUpcomingIdx = teamMatches.findIndex(
        (m) => m.startDate && parseUtcDate(m.startDate) >= startOfToday,
      );

      if (firstUpcomingIdx === -1) {
        firstUpcomingIdx = 0;
      }

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

  const upcomingMatch = upcomingMatches[0] || null;

  // 2. Fetch team results from database
  // (fallback to ID 4844 if current season has no played results yet)
  let teamResults = await getScrapedData<TeamResult[]>('team_results', teamId);
  if (!teamResults || teamResults.length === 0) {
    teamResults = await getScrapedData<TeamResult[]>('team_results', 4844);
  }

  if (!teamResults || teamResults.length === 0) {
    return {
      upcomingMatches,
      upcomingMatch,
      teamResults: [],
      latestMatch: null,
      matchDetail: null,
      players: [],
      trainers: [],
    };
  }

  const latestMatch = teamResults[0];
  const { matchId } = latestMatch;

  // 3. Fetch match detail from database
  const matchDetail = await getScrapedData<MatchDetail>('match_detail', matchId);

  if (!matchDetail) {
    return {
      upcomingMatches,
      upcomingMatch,
      teamResults,
      latestMatch: null,
      matchDetail: null,
      players: [],
      trainers: [],
    };
  }

  // 4. Determine if team is home or away
  const homeClubId = matchDetail.homeTeam?.club?.id;
  const isHome = homeClubId === teamId || homeClubId === 4844;
  const teamKey = isHome ? 'home' : 'away';

  // 5. Extract player IDs
  const lineup = matchDetail.lineUp?.[teamKey] || [];
  const playerIds: number[] = lineup
    .map((p) => p.player?.id)
    .filter((id: number | undefined): id is number => id !== undefined);

  // 6. Fetch player details and season results for each player
  const playersWithStats = await Promise.all(
    playerIds.map(async (id) => {
      const [detail, results] = await Promise.all([
        getScrapedData<PlayerDetail>('player_detail', id),
        getScrapedData<PlayerResult[]>('player_results', id),
      ]);

      if (!detail) return null;

      const validTotals = (results || [])
        .map((r) => r.total)
        .filter((t): t is number => typeof t === 'number' && t > 0);

      const sumTotal = validTotals.reduce((a, b) => a + b, 0);
      const avg = validTotals.length > 0
        ? Math.round((sumTotal / validTotals.length) * 10) / 10
        : 0;
      const max = validTotals.length > 0 ? Math.max(...validTotals) : 0;
      const misses = (results || []).reduce((acc, r) => acc + (r.faults || 0), 0);
      const totalPaid = '0 €';

      const player: PlayerWithStats = {
        ...detail,
        stats: {
          avg,
          max,
          misses,
          totalPaid,
        },
      };

      return player;
    }),
  );

  const validPlayers = playersWithStats.filter(
    (p): p is PlayerWithStats => p !== null,
  );

  // Sort players by AVG descending
  validPlayers.sort((a, b) => b.stats.avg - a.stats.avg);

  // 7. Fetch trainer data
  const trainersData = await getTrainersWithStats();
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
    latestMatch,
    matchDetail,
    players: validPlayers,
    trainers,
  };
}
