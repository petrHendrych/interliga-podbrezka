import { describe, expect, it } from 'vitest';
import type { MatchListItem } from '@/lib/api';
import type { PlayerSeasonBalance } from '@/lib/db-utils';
import { INTERLIGA_LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '@/lib/season-config';
import {
  collectBelowLimit,
  eligibleForStats,
  pickTopDonator,
  toPlayersWithStats,
} from '@/lib/home-helpers';

const [interligaId] = INTERLIGA_LEAGUE_IDS;
const [tournamentId] = TOURNAMENT_LEAGUE_IDS;

function match(overrides: Partial<MatchListItem> = {}): MatchListItem {
  return {
    id: 1,
    homeId: 1,
    awayId: 2,
    homeName: 'ŠKK Podbrezová',
    awayName: 'Rakovice',
    startDate: '2026-09-12 11:00:00',
    round: 1,
    isHome: true,
    leagueId: interligaId,
    teamTotalScore: 3600,
    ...overrides,
  } as MatchListItem;
}

function balance(overrides: Partial<PlayerSeasonBalance> = {}): PlayerSeasonBalance {
  return {
    externalPlayerId: 1,
    name: 'Ján Novák',
    userId: 'u1',
    firstName: 'Ján',
    lastName: 'Novák',
    totalDue: 10,
    totalBonuses: 0,
    totalPaid: 0,
    balance: 10,
    matchesCount: 3,
    avgScore: 150,
    maxScore: 640,
    totalFaults: 2,
    ...overrides,
  };
}

describe('collectBelowLimit', () => {
  const SEASON = 13;

  it('never shows the row for the Slovak Cup, which is exempt from the limit', () => {
    expect(collectBelowLimit([match()], 'pohar', SEASON)).toBeNull();
  });

  it('lists home Interliga and home tournament matches below the limit', () => {
    const matches = [
      match({ id: 1, teamTotalScore: 3600 }),
      match({ id: 2, teamTotalScore: 3800 }),
      match({ id: 3, teamTotalScore: 3400, leagueId: tournamentId }),
    ];

    expect(collectBelowLimit(matches, 'all', SEASON)?.map((m) => m.id)).toEqual([1, 3]);
  });

  it.each([
    [12, 3699, true],
    [12, 3700, false],
    [12, 3720, false],
    [13, 3720, true],
    [13, 3749, true],
    [13, 3750, false],
  ])('season %i lists a team total of %i: %s', (seasonId, teamTotalScore, listed) => {
    const below = collectBelowLimit([match({ teamTotalScore })], 'all', seasonId);
    expect(below).toHaveLength(listed ? 1 : 0);
  });

  it('ignores away matches, which are exempt', () => {
    const away = [
      match({ isHome: false, teamTotalScore: 3000 }),
      match({
        id: 2, isHome: false, leagueId: tournamentId, teamTotalScore: 3000,
      }),
    ];
    expect(collectBelowLimit(away, 'all', SEASON)).toEqual([]);
  });

  it('ignores an unplayed match with a zero team total', () => {
    expect(collectBelowLimit([match({ teamTotalScore: 0 })], 'interliga', SEASON)).toEqual([]);
  });

  it('keeps the empty row on screen for every filter the rule applies to', () => {
    expect(collectBelowLimit([], 'interliga', SEASON)).toEqual([]);
    expect(collectBelowLimit([], 'turnaje', SEASON)).toEqual([]);
    expect(collectBelowLimit([], 'all', SEASON)).toEqual([]);
  });

  it('still hides the row for the exempt Slovak Cup when nothing was played', () => {
    expect(collectBelowLimit([], 'pohar', SEASON)).toBeNull();
  });

  it('names the opponent, not our own team', () => {
    expect(collectBelowLimit([match()], 'all', SEASON)?.[0].name).toBe('Rakovice');
  });
});

describe('eligibleForStats', () => {
  it('drops players with no external id or no played match', () => {
    const balances = [
      balance({ userId: 'a' }),
      balance({ userId: 'b', externalPlayerId: null }),
      balance({ userId: 'c', matchesCount: 0 }),
    ];

    expect(eligibleForStats(balances).map((b) => b.userId)).toEqual(['a']);
  });
});

describe('toPlayersWithStats', () => {
  it('sorts by average descending and formats the amount owed', () => {
    const players = toPlayersWithStats([
      balance({ externalPlayerId: 1, avgScore: 140, totalDue: 12 }),
      balance({ externalPlayerId: 2, avgScore: 165 }),
    ]);

    expect(players.map((p) => p.id)).toEqual([2, 1]);
    expect(players[1].stats.totalPaid).toBe('12 €');
  });

  it('falls back to a placeholder name when the scraper gave none', () => {
    const [player] = toPlayersWithStats([
      balance({ externalPlayerId: 7, firstName: undefined, lastName: undefined }),
    ]);

    expect(player.firstName).toBe('Player');
    expect(player.lastName).toBe('7');
  });
});

describe('pickTopDonator', () => {
  it('picks the largest debt', () => {
    const top = pickTopDonator([
      balance({ externalPlayerId: 1, totalDue: 12 }),
      balance({
        externalPlayerId: 2, totalDue: 40, firstName: 'Peter', lastName: 'Kováč',
      }),
    ]);

    expect(top).toEqual({ id: 2, name: 'Peter Kováč', amount: 40 });
  });

  it('returns null when nobody owes anything', () => {
    expect(pickTopDonator([balance({ totalDue: 0 })])).toBeNull();
    expect(pickTopDonator([])).toBeNull();
  });

  it('falls back to the full name when the first name is missing', () => {
    const top = pickTopDonator([balance({ firstName: undefined, name: 'Novák J.' })]);
    expect(top?.name).toBe('Novák J.');
  });
});
