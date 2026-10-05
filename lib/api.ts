import { DEFAULT_SEASON_ID } from './season-config';
import { normalizeMatchList } from './sync-transform';
import type { LaneResult } from './substitutions';

const BASE_URL = 'https://api.vysledky.kolky.sk';

export const TEAM_ID = 5008;

/**
 * The results API sends naive timestamps ("2026-09-12 11:00:00") that are UTC, so
 * `new Date()` alone would read them in the machine's zone and shift every match by
 * that offset — a fixture at 13:00 in Podbrezová showed up as 11:00.
 */
export function parseApiDate(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  let iso = dateString.trim().replace(' ', 'T');
  if (!iso.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    iso += 'Z';
  }
  return new Date(iso);
}

export interface MatchListItem {
  id: number;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  startDate: string;
  round: number;
  teamTotalScore?: number | null;
  homeTeamPoints?: number | null;
  awayTeamPoints?: number | null;
  /** Our and the opponent's match points, as stored in `matches` rather than home/away. */
  teamMatchPoints?: number | null;
  opponentMatchPoints?: number | null;
  opponent?: string;
  isHome?: boolean;
  leagueId?: number;
  leagueName?: string;
  [key: string]: unknown;
}

export interface TeamResult {
  id: number;
  matchId: number;
  teamId: number;
  [key: string]: unknown;
}

export interface ApiPlayerRef {
  id: number;
  firstName?: string;
  lastName?: string;
}

export interface LineUpRow {
  id?: number;
  player: ApiPlayerRef;
  /** First throw of the substitute on this position; null when nobody was substituted. */
  changeThrow?: number | null;
  lanes?: LaneResult[];
}

/** Only sent when `substitutions` is in the requested fields. */
export interface MatchSubstitution {
  id: number;
  matchId: number;
  teamState: 'home' | 'away';
  /** The substitute's first throw — equals `changeThrow` on the starter's lineUp row. */
  throwNumber: number;
  player: ApiPlayerRef;
  newPlayer: ApiPlayerRef;
}

export interface MatchDetail {
  id: number;
  homeTeam: {
    id: number;
    club: { id: number };
  };
  awayTeam: {
    id: number;
    club: { id: number };
  };
  lineUp: {
    home: LineUpRow[];
    away: LineUpRow[];
  };
  substitutions?: MatchSubstitution[];
  league?: { seasonId?: number };
  [key: string]: unknown;
}

export interface PlayerResult {
  full: number;
  clean: number;
  total: number;
  faults: number;
  match?: {
    id: number;
    date: string;
    homeTeam?: { club?: { name?: string } };
    awayTeam?: { club?: { name?: string } };
  };
  [key: string]: unknown;
}

export interface PlayerDetail {
  id: number;
  firstName: string;
  lastName: string;
  [key: string]: unknown;
}

async function fetchLeagueApi<T>(endpoint: string, payload: unknown): Promise<T> {
  const token = process.env.X_APP_ACCESSTOKEN;

  if (!token) {
    throw new Error('X_APP_ACCESSTOKEN is not defined in environment variables');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      origin: 'https://vysledky.kolky.sk',
      referer: 'https://vysledky.kolky.sk/',
      'x-app-accesstoken': token,
    },
    body: JSON.stringify(payload),
    cache: 'no-store', // Ensure we get fresh data
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(`API error (${response.status}): ${errorData.message || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function getTeamResults(teamId: number) {
  const data = await fetchLeagueApi<{ list: TeamResult[] }>('/team/results', { id: teamId });
  return data.list;
}

/**
 * Only what `syncData` reads; `lineUp` is returned regardless of this list. `substitutions`
 * names who replaced whom from which throw, and `results.lanes` puts the per-lane split on
 * every lineUp row — neither is sent unless asked for, and the substitution money needs both.
 */
export const MATCH_DETAIL_FIELDS = [
  'league', 'details', 'teams', 'teams.club', 'results', 'results.lanes', 'substitutions', 'hall',
];

export async function getMatchDetail(matchId: number) {
  return fetchLeagueApi<MatchDetail>('/match/detail', {
    id: matchId,
    fields: MATCH_DETAIL_FIELDS,
  });
}

export async function getPlayerResults(playerId: number, seasonId: number = DEFAULT_SEASON_ID) {
  const data = await fetchLeagueApi<{ list: PlayerResult[] }>('/player/results', {
    id: playerId,
    seasonId,
    fields: [
      'results.match',
      'results.tournament',
      'results.tournamentRound',
      'results.tournamentRound.hall',
      'results.match.hall',
      'results.match.hall.parent',
      'results.opponent',
      'results.full',
      'results.clean',
      'results.total',
      'results.faults',
    ],
  });
  return data.list;
}

export async function getPlayerDetail(playerId: number) {
  return fetchLeagueApi<PlayerDetail>('/player/detail', {
    id: playerId,
  });
}

export async function getMatchList(teamId: number): Promise<MatchListItem[]> {
  const data = await fetchLeagueApi<{ list?: MatchListItem[] } | MatchListItem[]>('/match/list', { id: teamId });
  return normalizeMatchList(data);
}
