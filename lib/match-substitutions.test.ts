import { describe, expect, it } from 'vitest';
import { substitutionInputFor } from '@/lib/match-substitutions';

const LANES = [
  {
    full: 100, clean: 76, total: 176, faults: 0,
  },
  {
    full: 101, clean: 54, total: 155, faults: 0,
  },
  {
    full: 102, clean: 53, total: 155, faults: 0,
  },
  {
    full: 103, clean: 52, total: 155, faults: 0,
  },
];

const AWAY_AT_JIHLAVA = {
  homeTeam: { id: 5014, name: 'KK Jihlava', club: { id: 218, name: 'KK Jihlava' } },
  awayTeam: { id: 5008, name: 'ŠK Železiarne Podbrezová', club: { id: 649, name: 'ŠK Podbrezová' } },
  lineUp: {
    away: [{
      player: { id: 20299, firstName: 'Bystrík', lastName: 'Vadovič' },
      full: 406,
      clean: 235,
      total: 641,
      faults: 0,
      teamId: 5008,
      lanes: LANES,
    }],
    home: [{
      player: { id: 134008, firstName: 'Miroslav', lastName: 'Pleskal' },
      total: 611,
      faults: 1,
      lanes: LANES,
    }],
  },
  substitutions: [
    {
      id: 8585,
      teamState: 'away',
      throwNumber: 91,
      player: { id: 20299, firstName: 'Bystrík', lastName: 'Vadovič' },
      newPlayer: { id: 19055, firstName: 'Šimon', lastName: 'Dubrava' },
    },
    {
      id: 8587,
      teamState: 'home',
      throwNumber: 1,
      player: { id: 134008 },
      newPlayer: { id: 127639 },
    },
  ],
};

describe('substitutionInputFor', () => {
  it('takes our side only, with the opponent named, from season 13', () => {
    const input = substitutionInputFor(44990, AWAY_AT_JIHLAVA, 13);

    expect(input?.lineUpExternalIds).toEqual([20299]);
    expect(input?.candidates.map((c) => [c.substitutionId, c.opponent])).toEqual([
      [8585, 'KK Jihlava'],
    ]);
  });

  it.each([12, null])('leaves season %s whole', (seasonId) => {
    expect(substitutionInputFor(44568, AWAY_AT_JIHLAVA, seasonId)).toBeNull();
  });

  it('never undoes a split from a snapshot without the substitutions field', () => {
    const { substitutions, ...oldSnapshot } = AWAY_AT_JIHLAVA;
    expect(substitutions).toHaveLength(2);
    expect(substitutionInputFor(44990, oldSnapshot, 13)).toBeNull();
  });
});
