const BASE_URL = 'https://api.vysledky.kolky.sk';

export interface TeamResult {
  id: number;
  [key: string]: unknown;
}

export interface MatchDetail {
  teams: {
    home: { club: { id: number } };
    away: { club: { id: number } };
  };
  results: {
    home: { players: { player?: { id: number } }[] };
    away: { players: { player?: { id: number } }[] };
  };
  [key: string]: unknown;
}

export interface PlayerResult {
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
  return fetchLeagueApi<TeamResult[]>('/team/results', { id: teamId });
}

export async function getMatchDetail(matchId: number) {
  return fetchLeagueApi<MatchDetail>('/match/detail', {
    id: matchId,
    fields: [
      'league',
      'details',
      'teams',
      'teams.club',
      'results',
      'results.lanes',
      'referee',
      'substitutions',
      'sprint',
      'hall',
      'hall.parent',
      'cards',
      'cards.player',
    ],
  });
}

export async function getPlayerResults(playerId: number, seasonId: number = 12) {
  return fetchLeagueApi<PlayerResult>('/player/results', {
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
    ],
  });
}
