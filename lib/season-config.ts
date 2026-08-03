export interface LeagueConfig {
  leagueId: number;
  // The cup re-registers the squad under a new id for the final rounds.
  teamIds: number[];
  key: 'interliga' | 'pohar';
  name: string;
}

export interface SeasonConfig {
  id: number;
  name: string; // Display name e.g. "2026/2027"
  leagues: LeagueConfig[];
}

export const SEASONS_CONFIG: SeasonConfig[] = [
  {
    id: 13,
    name: '2026/2027',
    leagues: [
      {
        leagueId: 368,
        teamIds: [5008],
        key: 'interliga',
        name: 'Interliga',
      },
    ],
  },
  {
    id: 12,
    name: '2025/2026',
    leagues: [
      {
        leagueId: 354,
        teamIds: [4844],
        key: 'interliga',
        name: 'Interliga',
      },
      {
        leagueId: 364,
        teamIds: [4948, 4988],
        key: 'pohar',
        name: 'Slovenský pohár',
      },
    ],
  },
];

export const DEFAULT_SEASON_ID = 13;

/** Interliga home matches under this team total fine every player who played. */
export const TEAM_SCORE_LIMIT = 3750;

export function isCurrentSeason(seasonId: number): boolean {
  return seasonId === DEFAULT_SEASON_ID;
}

export function getSeasonConfig(seasonId: number): SeasonConfig | undefined {
  return SEASONS_CONFIG.find((s) => s.id === seasonId);
}

export function getLeagueConfig(seasonId: number, key: string): LeagueConfig | undefined {
  const season = getSeasonConfig(seasonId);
  if (!season) return undefined;
  return season.leagues.find((l) => l.key === key);
}

export function getAllTeamIds(): number[] {
  const teamIds = new Set<number>();
  SEASONS_CONFIG.forEach((season) => {
    season.leagues.forEach((league) => {
      league.teamIds.forEach((id) => teamIds.add(id));
    });
  });
  return Array.from(teamIds);
}

export function getTeamIdsForSeason(seasonId: number): number[] {
  const season = getSeasonConfig(seasonId);
  if (!season) return [];
  return season.leagues.flatMap((l) => l.teamIds);
}

export function getSeasonAndLeagueConfig(
  teamId?: number,
  leagueId?: number,
  leagueName?: string,
): { seasonId: number; leagueId: number; leagueName: string } | null {
  const allLeagues = SEASONS_CONFIG.flatMap((season) => (
    season.leagues.map((league) => ({
      seasonId: season.id,
      leagueId: league.leagueId,
      leagueName: league.name,
      teamIds: league.teamIds,
    }))
  ));

  const matchById = allLeagues.find((l) => (
    (teamId && l.teamIds.includes(teamId))
    || (leagueId && l.leagueId === leagueId)
  ));

  if (matchById) {
    return {
      seasonId: matchById.seasonId,
      leagueId: matchById.leagueId,
      leagueName: matchById.leagueName,
    };
  }

  if (leagueName) {
    const matchByName = allLeagues.find(
      (l) => l.leagueName.toLowerCase() === leagueName.toLowerCase(),
    );
    if (matchByName) {
      return {
        seasonId: matchByName.seasonId,
        leagueId: matchByName.leagueId,
        leagueName: matchByName.leagueName,
      };
    }
  }

  return null;
}
