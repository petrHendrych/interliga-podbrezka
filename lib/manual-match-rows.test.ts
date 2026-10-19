import { describe, expect, it } from 'vitest';
import { buildManualMatchRows, toManualPositions } from '@/lib/manual-match-rows';
import type {
  ManualMatchPlayerInput,
  ManualMatchPositionInput,
  ManualMatchSubstitutionInput,
} from '@/lib/validation/manual-match';

function player(userId: string, full: number, clean: number, faults = 0): ManualMatchPlayerInput {
  return {
    userId, full, clean, faults,
  };
}

function sub(
  userId: string,
  fromThrow: number,
  full: number,
  clean: number,
  faults = 0,
): ManualMatchSubstitutionInput {
  return { ...player(userId, full, clean, faults), fromThrow };
}

function plainPositions(): ManualMatchPositionInput[] {
  return ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
    starter: player(`u-${id}`, 400, 200, 1),
    substitutions: [],
  }));
}

describe('buildManualMatchRows', () => {
  it('writes a plain squad as plain rows', () => {
    const rows = buildManualMatchRows(plainPositions());

    expect(rows.teamTotalScore).toBe(3600);
    expect(rows.substitutions).toEqual([]);
    expect(rows.players[0]).toEqual({
      userId: 'u-a',
      full: 400,
      clean: 200,
      total: 600,
      avg: '150',
      faults: 1,
      substitutionRole: null,
      positionTotal: null,
      positionShare: null,
    });
  });

  it('counts a substituted position once in the team total', () => {
    const squad = plainPositions();
    squad[1] = {
      starter: player('u-b', 260, 120),
      substitutions: [sub('u-sub', 61, 250, 110)],
    };
    const rows = buildManualMatchRows(squad);

    expect(rows.teamTotalScore).toBe(3000 + 740);
    expect(rows.players.find((p) => p.userId === 'u-b')).toMatchObject({
      total: 740, avg: '185', substitutionRole: 'major', positionTotal: 740, positionShare: '0.5',
    });
    expect(rows.players.find((p) => p.userId === 'u-sub')).toMatchObject({
      total: 360, avg: '90', substitutionRole: 'minor', positionTotal: 740, positionShare: '0.5',
    });
  });

  it('links a chain to the player each substitute replaced', () => {
    const squad = plainPositions();
    squad[3] = {
      starter: player('u-d', 250, 120),
      substitutions: [sub('u-sub1', 61, 120, 60), sub('u-sub2', 91, 125, 55)],
    };
    const rows = buildManualMatchRows(squad);

    expect(rows.substitutions).toEqual([
      { starterUserId: 'u-d', substituteUserId: 'u-sub1', throwNumber: 61 },
      { starterUserId: 'u-sub1', substituteUserId: 'u-sub2', throwNumber: 91 },
    ]);
    expect(rows.players).toHaveLength(8);
    expect(rows.teamTotalScore).toBe(3000 + 730);
  });

  it('stores a third as the exact share the money rounds', () => {
    const squad = plainPositions();
    squad[0] = {
      starter: player('u-a', 160, 80),
      substitutions: [sub('u-sub1', 41, 160, 70), sub('u-sub2', 81, 150, 80)],
    };
    const rows = buildManualMatchRows(squad);

    expect(rows.players.slice(0, 3).map((p) => p.positionShare))
      .toEqual([String(1 / 3), String(1 / 3), String(1 / 3)]);
  });
});

describe('toManualPositions', () => {
  function reload(squad: ManualMatchPositionInput[]) {
    const built = buildManualMatchRows(squad);
    const stored = built.players.map((p) => ({
      userId: p.userId,
      name: p.userId.toUpperCase(),
      full: p.full,
      clean: p.clean,
      faults: p.faults,
      substitutionRole: p.substitutionRole,
    }));
    return toManualPositions(stored, built.substitutions);
  }

  function named(squad: ManualMatchPositionInput[]) {
    return squad.map((p) => ({
      starter: { ...p.starter, name: p.starter.userId.toUpperCase() },
      substitutions: p.substitutions.map((s) => ({ ...s, name: s.userId.toUpperCase() })),
    }));
  }

  it('reloads a plain squad unchanged', () => {
    const squad = plainPositions();
    expect(reload(squad)).toEqual(named(squad));
  });

  it('reloads every player\'s own part of a single switch and of a chain', () => {
    const squad = plainPositions();
    squad[1] = {
      starter: player('u-b', 90, 40, 1),
      substitutions: [sub('u-sub', 31, 330, 160, 4)],
    };
    squad[4] = {
      starter: player('u-e', 120, 60),
      substitutions: [sub('u-sub1', 31, 125, 55, 1), sub('u-sub2', 61, 250, 120)],
    };
    expect(reload(squad)).toEqual(named(squad));
  });
});
