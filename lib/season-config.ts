export type LeagueKey = 'interliga' | 'pohar' | 'svetovypohar' | 'ligamajstrov';

export interface LeagueConfig {
  leagueId: number;
  // The cup re-registers the squad under a new id for the final rounds.
  teamIds: number[];
  key: LeagueKey;
  name: string;
  /** Entered by hand in /admin/matches; the scraper never produces these. */
  manual?: boolean;
}

export interface SeasonConfig {
  id: number;
  name: string; // Display name e.g. "2026/2027"
  leagues: LeagueConfig[];
}

/**
 * Tournaments are absent from the results API, so their ids are ours to pick.
 * The 9xxx block cannot collide with kolky.sk ids, which are three digits.
 */
const WORLD_CUP_ID_BASE = 9000;
const CHAMPIONS_LEAGUE_ID_BASE = 9100;

const worldCup = (seasonId: number): LeagueConfig => ({
  leagueId: WORLD_CUP_ID_BASE + seasonId,
  teamIds: [],
  key: 'svetovypohar',
  name: 'Svetový pohár',
  manual: true,
});

const championsLeague = (seasonId: number): LeagueConfig => ({
  leagueId: CHAMPIONS_LEAGUE_ID_BASE + seasonId,
  teamIds: [],
  key: 'ligamajstrov',
  name: 'Liga majstrov',
  manual: true,
});

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
      worldCup(13),
      championsLeague(13),
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
      worldCup(12),
      championsLeague(12),
    ],
  },
];

export const DEFAULT_SEASON_ID = 13;

/** Interliga home matches under this team total fine every player who played. */
export const TEAM_SCORE_LIMIT = 3750;

/** Manually entered matches get ids above this, so the range says "not scraped". */
export const MANUAL_MATCH_ID_BASE = 900_000_000;

export const MANUAL_LEAGUE_KEYS: LeagueKey[] = ['svetovypohar', 'ligamajstrov'];

/** The single filter tab that groups every manual competition. */
export const TOURNAMENT_FILTER_KEY = 'turnaje';

export function isCurrentSeason(seasonId: number): boolean {
  return seasonId === DEFAULT_SEASON_ID;
}

export function isManualMatchId(externalId: number): boolean {
  return externalId >= MANUAL_MATCH_ID_BASE;
}

export function getSeasonConfig(seasonId: number): SeasonConfig | undefined {
  return SEASONS_CONFIG.find((s) => s.id === seasonId);
}

export function getLeagueConfig(seasonId: number, key: string): LeagueConfig | undefined {
  const season = getSeasonConfig(seasonId);
  if (!season) return undefined;
  return season.leagues.find((l) => l.key === key);
}

/** Every league across every season, so id lists survive adding a season. */
function allLeagues(): LeagueConfig[] {
  return SEASONS_CONFIG.flatMap((season) => season.leagues);
}

export function getLeagueIdsForKey(key: LeagueKey): number[] {
  return allLeagues().filter((l) => l.key === key).map((l) => l.leagueId);
}

export function getLeagueByLeagueId(leagueId: number): LeagueConfig | undefined {
  return allLeagues().find((l) => l.leagueId === leagueId);
}

export function getManualLeagues(seasonId: number): LeagueConfig[] {
  const season = getSeasonConfig(seasonId);
  if (!season) return [];
  return season.leagues.filter((l) => l.manual);
}

export const INTERLIGA_LEAGUE_IDS = getLeagueIdsForKey('interliga');

/** 366 is a retired "Finále" id that is still stamped on rows in the database. */
export const POHAR_LEAGUE_IDS = [...getLeagueIdsForKey('pohar'), 366];

export const TOURNAMENT_LEAGUE_IDS = MANUAL_LEAGUE_KEYS.flatMap(getLeagueIdsForKey);

export function getAllTeamIds(): number[] {
  const teamIds = new Set<number>();
  SEASONS_CONFIG.forEach((season) => {
    season.leagues.filter((l) => !l.manual).forEach((league) => {
      league.teamIds.forEach((id) => teamIds.add(id));
    });
  });
  return Array.from(teamIds);
}

export function getTeamIdsForSeason(seasonId: number): number[] {
  const season = getSeasonConfig(seasonId);
  if (!season) return [];
  return season.leagues.filter((l) => !l.manual).flatMap((l) => l.teamIds);
}

export function getSeasonAndLeagueConfig(
  teamId?: number,
  leagueId?: number,
  leagueName?: string,
): { seasonId: number; leagueId: number; leagueName: string } | null {
  // Manual leagues are excluded so a scrape can never stamp a tournament id.
  const scrapedLeagues = SEASONS_CONFIG.flatMap((season) => (
    season.leagues.filter((league) => !league.manual).map((league) => ({
      seasonId: season.id,
      leagueId: league.leagueId,
      leagueName: league.name,
      teamIds: league.teamIds,
    }))
  ));

  const matchById = scrapedLeagues.find((l) => (
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
    const matchByName = scrapedLeagues.find(
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
