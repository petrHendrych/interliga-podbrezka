import { describe, expect, it } from 'vitest';
import {
  INTERLIGA_LEAGUE_IDS,
  MANUAL_MATCH_ID_BASE,
  POHAR_LEAGUE_IDS,
  SEASONS_CONFIG,
  TOURNAMENT_LEAGUE_IDS,
  getAllTeamIds,
  getLeagueByLeagueId,
  getLeagueConfig,
  getLeagueIdsForKey,
  getManualLeagues,
  getSeasonAndLeagueConfig,
  getSeasonConfig,
  getSeasonIdForDate,
  getTeamIdsForSeason,
  isManualMatchId,
} from '@/lib/season-config';

describe('getSeasonIdForDate', () => {
  it('starts a season on 1 August UTC', () => {
    expect(getSeasonIdForDate(new Date('2025-07-31T23:59:59Z'))).toBeNull();
    expect(getSeasonIdForDate(new Date('2025-08-01T00:00:00Z'))).toBe(12);
    expect(getSeasonIdForDate(new Date('2026-07-31T23:59:59Z'))).toBe(12);
    expect(getSeasonIdForDate(new Date('2026-08-01T00:00:00Z'))).toBe(13);
  });

  it('returns null outside every configured season', () => {
    expect(getSeasonIdForDate(new Date('2019-05-01T00:00:00Z'))).toBeNull();
    expect(getSeasonIdForDate(new Date('2099-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('manual match ids', () => {
  it('starts the reserved range at 900 000 000', () => {
    expect(isManualMatchId(MANUAL_MATCH_ID_BASE - 1)).toBe(false);
    expect(isManualMatchId(MANUAL_MATCH_ID_BASE)).toBe(true);
  });
});

describe('league ids', () => {
  it('derives tournament ids as 9000 + season and 9100 + season', () => {
    SEASONS_CONFIG.forEach((season) => {
      const worldCup = getLeagueConfig(season.id, 'svetovypohar');
      const championsLeague = getLeagueConfig(season.id, 'ligamajstrov');

      expect(worldCup?.leagueId).toBe(9000 + season.id);
      expect(championsLeague?.leagueId).toBe(9100 + season.id);
    });
  });

  it('keeps tournament ids out of the three-digit kolky.sk range', () => {
    TOURNAMENT_LEAGUE_IDS.forEach((id) => expect(id).toBeGreaterThan(999));
    INTERLIGA_LEAGUE_IDS.forEach((id) => expect(id).toBeLessThan(1000));
  });

  it('keeps the retired Finále id 366 in the cup list even though it has no config', () => {
    expect(POHAR_LEAGUE_IDS).toContain(366);
    expect(getLeagueByLeagueId(366)).toBeUndefined();
  });

  it('returns an empty list for an unknown key', () => {
    expect(getLeagueIdsForKey('nonsense' as never)).toEqual([]);
  });
});

describe('team ids', () => {
  it('never includes a manual league, which has no team of its own', () => {
    const manualTeamIds = SEASONS_CONFIG
      .flatMap((s) => s.leagues)
      .filter((l) => l.manual)
      .flatMap((l) => l.teamIds);

    expect(manualTeamIds).toEqual([]);
    expect(getAllTeamIds().length).toBeGreaterThan(0);
  });

  it('returns an empty list for an unknown season', () => {
    expect(getTeamIdsForSeason(999)).toEqual([]);
    expect(getSeasonConfig(999)).toBeUndefined();
    expect(getManualLeagues(999)).toEqual([]);
  });
});

describe('getSeasonAndLeagueConfig', () => {
  it('matches by team id first', () => {
    const [teamId] = getTeamIdsForSeason(12);
    expect(getSeasonAndLeagueConfig(teamId)?.seasonId).toBe(12);
  });

  it('matches by league id when no team id is given', () => {
    const [leagueId] = INTERLIGA_LEAGUE_IDS;
    expect(getSeasonAndLeagueConfig(undefined, leagueId)?.leagueId).toBe(leagueId);
  });

  it('falls back to a case-insensitive league name', () => {
    const config = getSeasonAndLeagueConfig(undefined, undefined, 'iNTERLIGA');
    expect(config?.leagueName?.toLowerCase()).toContain('interliga');
  });

  it('never resolves a manual league from scraped input', () => {
    const [tournamentId] = TOURNAMENT_LEAGUE_IDS;
    expect(getSeasonAndLeagueConfig(undefined, tournamentId)).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(getSeasonAndLeagueConfig()).toBeNull();
    expect(getSeasonAndLeagueConfig(0, 0, 'Bundesliga')).toBeNull();
  });
});
