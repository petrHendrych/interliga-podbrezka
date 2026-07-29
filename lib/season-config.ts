export interface LeagueConfig {
  leagueId: number;
  teamId: number;
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
        teamId: 5008,
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
        teamId: 4844,
        key: 'interliga',
        name: 'Interliga',
      },
      {
        leagueId: 364,
        teamId: 4948,
        key: 'pohar',
        name: 'Slovenský pohár',
      },
    ],
  },
];

export const DEFAULT_SEASON_ID = 13;

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
      teamIds.add(league.teamId);
    });
  });
  return Array.from(teamIds);
}

export function getTeamIdsForSeason(seasonId: number): number[] {
  const season = getSeasonConfig(seasonId);
  if (!season) return [];
  return season.leagues.map((l) => l.teamId);
}
