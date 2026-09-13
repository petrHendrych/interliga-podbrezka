import { describe, expect, it } from 'vitest';
import {
  INTERLIGA_LEAGUE_IDS,
  POHAR_LEAGUE_IDS,
  TOURNAMENT_LEAGUE_IDS,
} from '@/lib/season-config';
import {
  type MatchContext,
  type PlayerRow,
  approvalAffectsTrainerPayments,
  derivePlayers,
  deriveTrainerPayments,
  faultFine,
  faultlessStreaks,
  isTeamUnderLimit,
  isUnderLimitEligible,
  playerBonus,
  specialFaultFine,
  streakFineFor,
  trainerCleanSweepFine,
  trainerElitePlayerBonus,
  trainerScoreBonus,
  trainerZeroFaultsBonus,
  worstTotal,
} from '@/lib/money-rules';

const [interligaId] = INTERLIGA_LEAGUE_IDS;
const [tournamentId] = TOURNAMENT_LEAGUE_IDS;
const [poharId] = POHAR_LEAGUE_IDS;

function player(overrides: Partial<PlayerRow> & { userId: string }): PlayerRow {
  return {
    total: 620, faults: 0, specialFaultsCount: 0, ...overrides,
  };
}

function homeInterliga(teamTotalScore: number | null): MatchContext {
  return { teamTotalScore, isHome: true, leagueId: interligaId };
}

describe('faults (sequential fine)', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 3],
    [3, 6],
    [10, 55],
  ])('%i faults cost %i €', (faults, expected) => {
    expect(faultFine(faults)).toBe(expected);
  });

  it('treats a missing fault count as zero', () => {
    expect(faultFine(null)).toBe(0);
  });
});

describe('special faults', () => {
  it.each([[0, 0], [1, 5], [3, 15]])('%i special faults cost %i €', (count, expected) => {
    expect(specialFaultFine(count)).toBe(expected);
  });
});

describe('player total under 600', () => {
  it.each([
    [599, true, 1],
    [600, false, 0],
    [601, false, 0],
  ])('a total of %i is under-600: %s (%i €)', (total, flagged, fine) => {
    const rows = [player({ userId: 'a', total }), player({ userId: 'b', total: 900 })];
    const derived = derivePlayers(homeInterliga(4000), rows).get('a')!;

    expect(derived.isUnder600).toBe(flagged);
    // 'a' is also the worst player here, so subtract that 1 € to isolate the under-600 part.
    expect(derived.calculatedFine - 1).toBe(fine);
  });

  it('never fines a player who did not play', () => {
    const rows = [player({ userId: 'a', total: 0 }), player({ userId: 'b', total: 900 })];
    const derived = derivePlayers(homeInterliga(4000), rows).get('a')!;

    expect(derived.isUnder600).toBe(false);
    expect(derived.isWorstPlayer).toBe(false);
    expect(derived.calculatedFine).toBe(0);
  });
});

describe('player bonus from 700', () => {
  it.each([[699, 0], [700, 40], [701, 40]])('a total of %i earns %i €', (total, expected) => {
    expect(playerBonus(total)).toBe(expected);
  });
});

describe('worst in team', () => {
  it('fines the single lowest scorer among those who played', () => {
    const rows = [
      player({ userId: 'a', total: 540 }),
      player({ userId: 'b', total: 620 }),
      player({ userId: 'c', total: 0 }),
    ];
    expect(worstTotal(rows)).toBe(540);

    const derived = derivePlayers(homeInterliga(4000), rows);
    expect(derived.get('a')!.isWorstPlayer).toBe(true);
    expect(derived.get('b')!.isWorstPlayer).toBe(false);
    expect(derived.get('c')!.isWorstPlayer).toBe(false);
  });

  it('fines every player on the minimum — there is no tie-break', () => {
    const rows = [
      player({ userId: 'a', total: 610 }),
      player({ userId: 'b', total: 610 }),
      player({ userId: 'c', total: 800 }),
    ];
    const derived = derivePlayers(homeInterliga(4000), rows);

    expect(derived.get('a')!.isWorstPlayer).toBe(true);
    expect(derived.get('b')!.isWorstPlayer).toBe(true);
    expect(derived.get('a')!.calculatedFine).toBe(1);
    expect(derived.get('b')!.calculatedFine).toBe(1);
  });

  it('has no worst player when nobody played', () => {
    const rows = [player({ userId: 'a', total: 0 }), player({ userId: 'b', total: 0 })];
    expect(worstTotal(rows)).toBeNull();
    expect(derivePlayers(homeInterliga(null), rows).get('a')!.isWorstPlayer).toBe(false);
  });
});

describe('team total under the limit', () => {
  it.each([
    [3699, true, 2],
    [3700, false, 0],
    [3701, false, 0],
  ])('a team total of %i fines each player: %s (%i €)', (teamTotal, flagged, fine) => {
    const rows = [player({ userId: 'a', total: 900 }), player({ userId: 'b', total: 950 })];
    const derived = derivePlayers(homeInterliga(teamTotal), rows).get('b')!;

    expect(derived.isTeamUnderLimit).toBe(flagged);
    expect(derived.calculatedFine).toBe(fine);
  });

  it('spares a player who did not play', () => {
    const rows = [player({ userId: 'a', total: 0 }), player({ userId: 'b', total: 900 })];
    const derived = derivePlayers(homeInterliga(3000), rows);

    expect(derived.get('a')!.isTeamUnderLimit).toBe(false);
    expect(derived.get('a')!.calculatedFine).toBe(0);
    expect(derived.get('b')!.isTeamUnderLimit).toBe(true);
  });

  describe('league scope', () => {
    it.each<[string, MatchContext, boolean]>([
      ['home Interliga by league id', { isHome: true, leagueId: interligaId }, true],
      ['home Interliga by league name', { isHome: true, leagueName: 'Interliga sever' }, true],
      ['away Interliga', { isHome: false, leagueId: interligaId }, false],
      ['tournament at home', { isHome: true, leagueId: tournamentId }, true],
      ['tournament away', { isHome: false, leagueId: tournamentId }, false],
      ['Slovak Cup', { isHome: true, leagueId: poharId }, false],
      ['retired Finále id 366', { isHome: true, leagueId: 366 }, false],
      ['Interliga with an unknown side', { isHome: null, leagueId: interligaId }, false],
    ])('%s is penalised: %s', (_label, match, expected) => {
      expect(isUnderLimitEligible(match)).toBe(expected);
      expect(isTeamUnderLimit({ ...match, teamTotalScore: 3000 })).toBe(expected);
    });
  });

  it('is never under the limit without a team total', () => {
    expect(isTeamUnderLimit(homeInterliga(null))).toBe(false);
  });
});

describe('calculated fine composition', () => {
  it('adds up faults, worst player, under 600, special faults and the team limit', () => {
    const rows = [
      player({
        userId: 'a', total: 590, faults: 2, specialFaultsCount: 1,
      }),
      player({ userId: 'b', total: 900 }),
    ];
    const derived = derivePlayers(homeInterliga(3000), rows, { a: 0 }).get('a')!;

    // 3 (faults) + 1 (worst) + 1 (under 600) + 5 (special fault) + 2 (team under limit)
    expect(derived.calculatedFine).toBe(12);
  });

  it('keeps the success gathering out of calculatedFine', () => {
    const rows = [player({ userId: 'a', total: 900 }), player({ userId: 'b', total: 950 })];
    const derived = derivePlayers(homeInterliga(4000), rows, { a: 7 }).get('a')!;

    expect(derived.calculatedFine).toBe(1); // worst player only
    expect(derived.streakFine).toBe(10);
  });
});

describe('success gathering (faultless streak)', () => {
  it.each([[4, 0], [5, 10], [6, 10]])('a streak of %i costs %i €', (streak, expected) => {
    expect(streakFineFor(streak)).toBe(expected);
  });

  it('counts a first-ever faultless game as streak 1', () => {
    expect(faultlessStreaks([{ faults: 0 }])).toEqual([1]);
  });

  it('reaches the fine on the fifth consecutive faultless game', () => {
    const streaks = faultlessStreaks(Array.from({ length: 6 }, () => ({ faults: 0 })));

    expect(streaks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 10, 10]);
  });

  it('restarts the count after a fault', () => {
    const streaks = faultlessStreaks([
      { faults: 0 }, { faults: 0 }, { faults: 3 }, { faults: 0 }, { faults: 0 },
    ]);

    expect(streaks).toEqual([1, 2, 0, 1, 2]);
  });

  it('only reaches five after a fault when four clean games follow it', () => {
    const streaks = faultlessStreaks([
      { faults: 1 }, { faults: 0 }, { faults: 0 }, { faults: 0 }, { faults: 0 }, { faults: 0 },
    ]);

    expect(streaks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 0, 10]);
  });

  it('treats a missing fault count as faultless', () => {
    expect(faultlessStreaks([{ faults: null }, { faults: null }])).toEqual([1, 2]);
  });
});

describe('trainer: team performance', () => {
  it.each([
    [3799, null],
    [3800, 10],
    [3801, 10],
    [3899, 10],
    [3900, 15],
    [3901, 15],
    [3999, 15],
    [4000, 20],
    [4001, 20],
  ])('a team total of %i pays %s €', (teamTotal, expected) => {
    expect(trainerScoreBonus(teamTotal)).toBe(expected);
  });

  it('pays nothing without a team total', () => {
    expect(trainerScoreBonus(null)).toBeNull();
  });
});

describe('trainer: zero faults', () => {
  const faultless = (count: number, total = 620) => Array.from(
    { length: count },
    (_, i) => player({ userId: `p${i}`, total, faults: 0 }),
  );

  it('pays 10 € for a faultless match with six players who played', () => {
    expect(trainerZeroFaultsBonus(faultless(6))).toBe(10);
  });

  it('pays nothing with only five players', () => {
    expect(trainerZeroFaultsBonus(faultless(5))).toBeNull();
  });

  it('pays nothing when the team has any fault', () => {
    const rows = [...faultless(7), player({ userId: 'x', total: 600, faults: 1 })];
    expect(trainerZeroFaultsBonus(rows)).toBeNull();
  });

  it('pays nothing when no row carries a fault count at all', () => {
    const rows = faultless(6).map((r) => ({ ...r, faults: null }));
    expect(trainerZeroFaultsBonus(rows)).toBeNull();
  });

  it('counts only players who actually played', () => {
    const rows = [...faultless(5), player({ userId: 'bench', total: 0, faults: 0 })];
    expect(trainerZeroFaultsBonus(rows)).toBeNull();
  });
});

describe('trainer: elite players', () => {
  it('pays 10 € per player from 700 up, and nothing at 699', () => {
    expect(trainerElitePlayerBonus([player({ userId: 'a', total: 699 })])).toBeNull();
    expect(trainerElitePlayerBonus([player({ userId: 'a', total: 700 })])).toBe(10);
    expect(trainerElitePlayerBonus([
      player({ userId: 'a', total: 720 }),
      player({ userId: 'b', total: 800 }),
      player({ userId: 'c', total: 750 }),
    ])).toBe(30);
  });
});

describe('trainer: clean sweep', () => {
  const cases: [string, MatchContext, number | null][] = [
    ['8:0 from season 13 on', { seasonId: 13, teamMatchPoints: 8, opponentMatchPoints: 0 }, 10],
    ['8:0 in an earlier season', { seasonId: 12, teamMatchPoints: 8, opponentMatchPoints: 0 }, null],
    ['8:1', { seasonId: 13, teamMatchPoints: 8, opponentMatchPoints: 1 }, null],
    ['7:0', { seasonId: 13, teamMatchPoints: 7, opponentMatchPoints: 0 }, null],
    ['a 6:0 cup sweep', { seasonId: 13, teamMatchPoints: 6, opponentMatchPoints: 0 }, null],
    ['8:0.5', { seasonId: 13, teamMatchPoints: 8, opponentMatchPoints: 0.5 }, null],
    ['a match with no points', { seasonId: 13, teamMatchPoints: null, opponentMatchPoints: null }, null],
    ['a match with no season', { seasonId: null, teamMatchPoints: 8, opponentMatchPoints: 0 }, null],
  ];

  it.each(cases)('pays %s', (_label, match, expected) => {
    expect(trainerCleanSweepFine(match)).toBe(expected);
  });

  it.each([true, false])('ignores where the match was played (isHome %s)', (isHome) => {
    expect(trainerCleanSweepFine({
      seasonId: 13, isHome, teamMatchPoints: 8, opponentMatchPoints: 0,
    })).toBe(10);
  });
});

describe('approvalAffectsTrainerPayments', () => {
  it('is true for a trainer, whose payments only exist once approved', () => {
    expect(approvalAffectsTrainerPayments('trainer')).toBe(true);
  });

  it.each(['player', 'admin'])('is false for a %s', (role) => {
    expect(approvalAffectsTrainerPayments(role)).toBe(false);
  });
});

describe('deriveTrainerPayments', () => {
  it('returns one row per earned condition, each the amount owed to a single trainer', () => {
    const rows = Array.from({ length: 6 }, (_, i) => player({
      userId: `p${i}`, total: 710, faults: 0,
    }));

    expect(deriveTrainerPayments({ teamTotalScore: 3950, isHome: true }, rows)).toEqual([
      { conditionType: 'score_bonus', amount: 15 },
      { conditionType: 'zero_faults', amount: 10 },
      { conditionType: 'elite_player', amount: 60 },
    ]);
  });

  it('adds the clean sweep last when the match ended 8:0', () => {
    const rows = Array.from({ length: 6 }, (_, i) => player({
      userId: `p${i}`, total: 710, faults: 0,
    }));

    expect(deriveTrainerPayments({
      teamTotalScore: 3950,
      isHome: false,
      seasonId: 13,
      teamMatchPoints: 8,
      opponentMatchPoints: 0,
    }, rows)).toEqual([
      { conditionType: 'score_bonus', amount: 15 },
      { conditionType: 'zero_faults', amount: 10 },
      { conditionType: 'elite_player', amount: 60 },
      { conditionType: 'clean_sweep', amount: 10 },
    ]);
  });

  it('carries the 4000 tier through as a single 20 € score bonus', () => {
    const rows = Array.from({ length: 6 }, (_, i) => player({
      userId: `p${i}`, total: 680, faults: 0,
    }));

    expect(deriveTrainerPayments({ teamTotalScore: 4000, isHome: true }, rows)).toEqual([
      { conditionType: 'score_bonus', amount: 20 },
      { conditionType: 'zero_faults', amount: 10 },
    ]);
  });

  it('returns nothing when no condition is met', () => {
    const rows = [player({ userId: 'a', total: 600, faults: 2 })];
    expect(deriveTrainerPayments({ teamTotalScore: 3600, isHome: true }, rows)).toEqual([]);
  });
});
