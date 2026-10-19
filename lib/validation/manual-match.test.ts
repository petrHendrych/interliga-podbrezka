import { describe, expect, it } from 'vitest';
import { getManualLeagues } from '@/lib/season-config';
import {
  type ManualMatchInput,
  type ManualMatchPlayerInput,
  type ManualMatchPositionInput,
  type ManualMatchSubstitutionInput,
  POSITION_COUNT,
  isCountable,
  isMatchPoints,
  validateManualMatch,
} from '@/lib/validation/manual-match';

const SEASON_ID = 13;
const [manualLeague] = getManualLeagues(SEASON_ID);

function player(overrides: Partial<ManualMatchPlayerInput> = {}): ManualMatchPlayerInput {
  return {
    userId: crypto.randomUUID(), full: 400, clean: 200, faults: 1, ...overrides,
  };
}

function sub(
  fromThrow: number,
  overrides: Partial<ManualMatchPlayerInput> = {},
): ManualMatchSubstitutionInput {
  return { ...player(overrides), fromThrow };
}

function position(
  substitutions: ManualMatchSubstitutionInput[] = [],
  starter = player(),
): ManualMatchPositionInput {
  return { starter, substitutions };
}

function positions(...firsts: ManualMatchPositionInput[]): ManualMatchPositionInput[] {
  return [
    ...firsts,
    ...Array.from({ length: POSITION_COUNT - firsts.length }, () => position()),
  ];
}

function input(overrides: Partial<ManualMatchInput> = {}): ManualMatchInput {
  return {
    seasonId: SEASON_ID,
    leagueId: manualLeague.leagueId,
    date: '2026-09-12',
    opponent: 'Rakovice',
    isHome: true,
    opponentTotalScore: 3400,
    teamMatchPoints: null,
    opponentMatchPoints: null,
    positions: positions(),
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

describe('positions', () => {
  it(`accepts exactly ${POSITION_COUNT} positions`, () => {
    expect(validateManualMatch(input())).toBeNull();
  });

  it.each([0, POSITION_COUNT - 1, POSITION_COUNT + 1])('rejects %i positions', (count) => {
    const squad = Array.from({ length: count }, () => position());
    expect(validateManualMatch(input({ positions: squad }))).toBe('incompletePositions');
  });

  it('rejects a position with no player selected', () => {
    expect(validateManualMatch(input({
      positions: positions(position([], player({ userId: '' }))),
    }))).toBe('incompletePositions');
  });

  it('rejects a substitute with no player selected', () => {
    expect(validateManualMatch(input({
      positions: positions(position([sub(61, { userId: '' })])),
    }))).toBe('incompletePositions');
  });

  it('rejects the same player twice', () => {
    const duplicate = player({ userId: 'same-id' });
    expect(validateManualMatch(input({
      positions: positions(position([], duplicate), position([], { ...duplicate })),
    }))).toBe('duplicatePlayer');
  });

  it('rejects a substitute who already starts in another position', () => {
    const starter = player({ userId: 'same-id' });
    expect(validateManualMatch(input({
      positions: positions(position([], starter), position([sub(61, { userId: 'same-id' })])),
    }))).toBe('duplicatePlayer');
  });
});

describe('substitutions', () => {
  it('accepts one substitution at the half', () => {
    expect(validateManualMatch(input({ positions: positions(position([sub(61)])) }))).toBeNull();
  });

  it('accepts two substitutions in one position', () => {
    expect(validateManualMatch(input({
      positions: positions(position([sub(61), sub(91)])),
    }))).toBeNull();
  });

  it('accepts two substitutions in two positions', () => {
    expect(validateManualMatch(input({
      positions: positions(position([sub(31)]), position([sub(91)])),
    }))).toBeNull();
  });

  it.each([
    ['two in one position and one in another', [position([sub(31), sub(61)]), position([sub(91)])]],
    ['one in each of three positions', [position([sub(31)]), position([sub(61)]), position([sub(91)])]],
  ])('rejects a third substitution: %s', (_label, firsts) => {
    expect(validateManualMatch(input({ positions: positions(...firsts) })))
      .toBe('tooManySubstitutions');
  });

  it('rejects a substitution before season 13', () => {
    const [legacyLeague] = getManualLeagues(12);
    expect(validateManualMatch(input({
      seasonId: 12,
      leagueId: legacyLeague.leagueId,
      positions: positions(position([sub(61)])),
    }))).toBe('substitutionNotAllowed');
  });

  it.each([2, 61, 120])('accepts a switch at throw %i', (fromThrow) => {
    expect(validateManualMatch(input({ positions: positions(position([sub(fromThrow)])) })))
      .toBeNull();
  });

  it.each([1, 121, 0, 60.5, Number.NaN])('rejects a switch at throw %o', (fromThrow) => {
    expect(validateManualMatch(input({ positions: positions(position([sub(fromThrow)])) })))
      .toBe('invalidThrowNumber');
  });

  it.each([[91, 61], [61, 61]])('rejects a switch at %i followed by one at %i', (first, second) => {
    expect(validateManualMatch(input({
      positions: positions(position([sub(first), sub(second)])),
    }))).toBe('invalidThrowNumber');
  });
});

describe('scores', () => {
  it.each([
    ['a negative score', player({ full: -1 })],
    ['a fractional score', player({ clean: 12.5 })],
    ['a score above 1000', player({ full: 1001 })],
    ['faults above 200', player({ faults: 201 })],
  ])('rejects %s', (_label, row) => {
    expect(validateManualMatch(input({ positions: positions(position([], row)) })))
      .toBe('invalidScore');
  });

  it('rejects an invalid substitute score', () => {
    expect(validateManualMatch(input({
      positions: positions(position([sub(61, { faults: -1 })])),
    }))).toBe('invalidScore');
  });

  it('rejects an opponent total above 6000', () => {
    expect(validateManualMatch(input({ opponentTotalScore: 6_001 }))).toBe('invalidScore');
  });

  it('accepts a missing opponent total', () => {
    expect(validateManualMatch(input({ opponentTotalScore: null }))).toBeNull();
  });

  it('accepts the opponent total boundary of 6000', () => {
    expect(validateManualMatch(input({ opponentTotalScore: 6_000 }))).toBeNull();
  });
});

describe('match points', () => {
  it.each([
    [0, true],
    [4.5, true],
    [8, true],
    [-0.5, false],
    [8.5, false],
    [4.25, false],
    [Number.NaN, false],
  ])('%o is a valid match-point value: %s', (value, expected) => {
    expect(isMatchPoints(value)).toBe(expected);
  });

  it('accepts a match without points', () => {
    expect(validateManualMatch(input())).toBeNull();
  });

  it.each([[2, 6], [3.5, 4.5], [8, 0], [0, 0]])('accepts %o : %o', (team, opponent) => {
    expect(validateManualMatch(input({
      teamMatchPoints: team, opponentMatchPoints: opponent,
    }))).toBeNull();
  });

  it.each([[2, null], [null, 6]])('rejects only one side filled in (%o : %o)', (team, opponent) => {
    expect(validateManualMatch(input({
      teamMatchPoints: team, opponentMatchPoints: opponent,
    }))).toBe('invalidMatchPoints');
  });

  it.each([[9, 0], [2, -1], [4.25, 3.75]])('rejects %o : %o', (team, opponent) => {
    expect(validateManualMatch(input({
      teamMatchPoints: team, opponentMatchPoints: opponent,
    }))).toBe('invalidMatchPoints');
  });
});
