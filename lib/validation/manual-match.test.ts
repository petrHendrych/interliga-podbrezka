import { describe, expect, it } from 'vitest';
import { getManualLeagues } from '@/lib/season-config';
import {
  type ManualMatchInput,
  type ManualMatchPlayerInput,
  MAX_PLAYERS,
  isCountable,
  validateManualMatch,
} from '@/lib/validation/manual-match';

const SEASON_ID = 13;
const [manualLeague] = getManualLeagues(SEASON_ID);

function player(overrides: Partial<ManualMatchPlayerInput> = {}): ManualMatchPlayerInput {
  return {
    userId: crypto.randomUUID(), full: 400, clean: 200, faults: 1, ...overrides,
  };
}

function input(overrides: Partial<ManualMatchInput> = {}): ManualMatchInput {
  return {
    seasonId: SEASON_ID,
    leagueId: manualLeague.leagueId,
    date: '2026-09-12',
    opponent: 'Rakovice',
    isHome: true,
    opponentTotalScore: 3400,
    players: [player(), player()],
    ...overrides,
  };
}

describe('isCountable', () => {
  it.each([
    [0, true],
    [10, true],
    [1000, true],
    [1001, false],
    [-1, false],
    [1.5, false],
    [Number.NaN, false],
  ])('%o within 1000: %s', (value, expected) => {
    expect(isCountable(value, 1000)).toBe(expected);
  });
});

describe('league', () => {
  it('accepts a manual league of that season', () => {
    expect(validateManualMatch(input())).toBeNull();
  });

  it('rejects a league that is not manual', () => {
    expect(validateManualMatch(input({ leagueId: 368 }))).toBe('invalidLeague');
  });

  it('rejects a manual league from a different season', () => {
    const [otherLeague] = getManualLeagues(12);
    expect(validateManualMatch(input({ leagueId: otherLeague.leagueId })))
      .toBe('invalidLeague');
  });
});

describe('date', () => {
  it.each(['', 'not-a-date'])('rejects %o', (date) => {
    expect(validateManualMatch(input({ date }))).toBe('invalidDate');
  });
});

describe('players', () => {
  it('rejects an empty squad', () => {
    expect(validateManualMatch(input({ players: [] }))).toBe('noPlayers');
  });

  it(`rejects more than ${MAX_PLAYERS} players`, () => {
    const players = Array.from({ length: MAX_PLAYERS + 1 }, () => player());
    expect(validateManualMatch(input({ players }))).toBe('noPlayers');
  });

  it(`accepts exactly ${MAX_PLAYERS} players`, () => {
    const players = Array.from({ length: MAX_PLAYERS }, () => player());
    expect(validateManualMatch(input({ players }))).toBeNull();
  });

  it('rejects a row with no player selected', () => {
    expect(validateManualMatch(input({ players: [player({ userId: '' })] }))).toBe('noPlayers');
  });

  it('rejects the same player twice', () => {
    const duplicate = player({ userId: 'same-id' });
    expect(validateManualMatch(input({ players: [duplicate, { ...duplicate }] })))
      .toBe('duplicatePlayer');
  });
});

describe('scores', () => {
  it.each([
    ['a negative score', player({ full: -1 })],
    ['a fractional score', player({ clean: 12.5 })],
    ['a score above 1000', player({ full: 1001 })],
    ['faults above 200', player({ faults: 201 })],
  ])('rejects %s', (_label, row) => {
    expect(validateManualMatch(input({ players: [row] }))).toBe('invalidScore');
  });

  it('rejects an opponent total above 12000', () => {
    expect(validateManualMatch(input({ opponentTotalScore: 12_001 }))).toBe('invalidScore');
  });

  it('accepts a missing opponent total', () => {
    expect(validateManualMatch(input({ opponentTotalScore: null }))).toBeNull();
  });

  it('accepts the opponent total boundary of 12000', () => {
    expect(validateManualMatch(input({ opponentTotalScore: 12_000 }))).toBeNull();
  });
});
