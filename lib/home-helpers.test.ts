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
  it('never shows the row for the Slovak Cup, which is exempt from the limit', () => {
    expect(collectBelowLimit([match()], 'pohar')).toBeNull();
  });

  it('lists home Interliga and tournament matches below the limit', () => {
    const matches = [
      match({ id: 1, teamTotalScore: 3600 }),
      match({ id: 2, teamTotalScore: 3800 }),
      match({
        id: 3, teamTotalScore: 3400, leagueId: tournamentId, isHome: false,
      }),
    ];

    expect(collectBelowLimit(matches, 'all')?.map((m) => m.id)).toEqual([1, 3]);
  });

  it('ignores away Interliga matches, which are exempt', () => {
    const matches = [match({ isHome: false, teamTotalScore: 3000 })];
    expect(collectBelowLimit(matches, 'all')).toBeNull();
  });

  it('ignores an unplayed match with a zero team total', () => {
    expect(collectBelowLimit([match({ teamTotalScore: 0 })], 'interliga')).toEqual([]);
  });

  it('keeps the empty row on screen for the filters the rule applies to', () => {
    expect(collectBelowLimit([], 'interliga')).toEqual([]);
    expect(collectBelowLimit([], 'turnaje')).toEqual([]);
    expect(collectBelowLimit([], 'all')).toBeNull();
  });

  it('names the opponent, not our own team', () => {
    expect(collectBelowLimit([match()], 'all')?.[0].name).toBe('Rakovice');
    expect(collectBelowLimit([match({ isHome: false, leagueId: tournamentId })], 'all')?.[0].name)
      .toBe('ŠKK Podbrezová');
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
