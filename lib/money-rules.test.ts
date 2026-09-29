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
  isTeamLoss,
  isTeamUnderLimit,
  isUnderLimitEligible,
  playerBonus,
  specialFaultFine,
  storedStreak,
  streakFineFor,
  teamUnderLimitFineFor,
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

const LEGACY_SEASON = 12;
const CURRENT_SEASON = 13;

function homeInterliga(
  teamTotalScore: number | null,
  seasonId: number | null = LEGACY_SEASON,
): MatchContext {
  return {
    teamTotalScore, isHome: true, leagueId: interligaId, seasonId,
  };
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
    [LEGACY_SEASON, 3699, true, 2],
    [LEGACY_SEASON, 3700, false, 0],
    [LEGACY_SEASON, 3701, false, 0],
    [CURRENT_SEASON, 3749, true, 5],
    [CURRENT_SEASON, 3750, false, 0],
    [CURRENT_SEASON, 3751, false, 0],
  ])('season %i: a team total of %i fines each player: %s (%i €)', (seasonId, teamTotal, flagged, fine) => {
    const rows = [player({ userId: 'a', total: 900 }), player({ userId: 'b', total: 950 })];
    const derived = derivePlayers(homeInterliga(teamTotal, seasonId), rows).get('b')!;

    expect(derived.isTeamUnderLimit).toBe(flagged);
    expect(derived.calculatedFine).toBe(fine);
  });

  it('keeps the old limit for an earlier season and the new one from season 13', () => {
    expect(isTeamUnderLimit(homeInterliga(3720, LEGACY_SEASON))).toBe(false);
    expect(isTeamUnderLimit(homeInterliga(3720, CURRENT_SEASON))).toBe(true);
  });

  it('treats a match with no season as an earlier one', () => {
    expect(isTeamUnderLimit(homeInterliga(3720, null))).toBe(false);
    expect(isTeamUnderLimit(homeInterliga(3699, null))).toBe(true);
    expect(teamUnderLimitFineFor(null)).toBe(2);
  });

  it.each([[11, 2], [12, 2], [13, 5], [14, 5]])('season %i fines %i € per player', (seasonId, fine) => {
    expect(teamUnderLimitFineFor(seasonId)).toBe(fine);
  });

  it('spares a player who did not play', () => {
    const rows = [player({ userId: 'a', total: 0 }), player({ userId: 'b', total: 900 })];
    const derived = derivePlayers(homeInterliga(3000), rows);

    expect(derived.get('a')!.isTeamUnderLimit).toBe(false);
    expect(derived.get('a')!.calculatedFine).toBe(0);
    expect(derived.get('b')!.isTeamUnderLimit).toBe(true);
  });

  describe.each([LEGACY_SEASON, CURRENT_SEASON])('league scope in season %i', (seasonId) => {
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
      expect(isTeamUnderLimit({ ...match, seasonId, teamTotalScore: 3000 })).toBe(expected);
    });
  });

  it('is never under the limit without a team total', () => {
    expect(isTeamUnderLimit(homeInterliga(null))).toBe(false);
  });
});

describe('team loss', () => {
  const points = (
    teamMatchPoints: number | null,
    opponentMatchPoints: number | null,
    overrides: MatchContext = {},
  ): MatchContext => ({
    seasonId: CURRENT_SEASON,
    isHome: true,
    leagueId: interligaId,
    teamTotalScore: 3900,
    teamMatchPoints,
    opponentMatchPoints,
    ...overrides,
  });

  it.each<[string, MatchContext, boolean]>([
    ['a 3:5 home loss', points(3, 5), true],
    ['a 4:4 draw', points(4, 4), false],
    ['a 5:3 win', points(5, 3), false],
    ['an away Interliga loss', points(3, 5, { isHome: false }), true],
    ['a cup loss on a split duel, 2.5:3.5', points(2.5, 3.5, { leagueId: poharId }), true],
    ['a 0:6 cup loss', points(0, 6, { leagueId: poharId }), true],
    ['a 3:3 cup draw', points(3, 3, { leagueId: poharId }), false],
    ['a 2:6 tournament loss away', points(2, 6, { leagueId: tournamentId, isHome: false }), true],
    ['a loss with an unknown side', points(3, 5, { isHome: null }), true],
    ['missing team points', points(null, 5), false],
    ['missing opponent points', points(3, null), false],
    ['a loss in an earlier season', points(3, 5, { seasonId: LEGACY_SEASON }), false],
    ['a loss with no season', points(3, 5, { seasonId: null }), false],
  ])('%s is a loss: %s', (_label, match, expected) => {
    expect(isTeamLoss(match)).toBe(expected);
  });

  it('fines every player who played 5 €, whatever their own score', () => {
    const rows = [
      player({ userId: 'a', total: 650 }),
      player({ userId: 'b', total: 720 }),
      player({ userId: 'c', total: 0 }),
    ];
    const derived = derivePlayers(points(3, 5), rows);

    expect(derived.get('a')!.isTeamLoss).toBe(true);
    expect(derived.get('a')!.calculatedFine).toBe(1 + 5); // worst + loss
    expect(derived.get('b')!.isTeamLoss).toBe(true);
    expect(derived.get('b')!.calculatedFine).toBe(5);
    expect(derived.get('b')!.bonusReceived).toBe(40);
    expect(derived.get('c')!.isTeamLoss).toBe(false);
    expect(derived.get('c')!.calculatedFine).toBe(0);
  });

  it('charges nothing for a draw or a win', () => {
    const rows = [player({ userId: 'a', total: 650 }), player({ userId: 'b', total: 700 })];

    expect(derivePlayers(points(4, 4), rows).get('b')!.calculatedFine).toBe(0);
    expect(derivePlayers(points(5, 3), rows).get('b')!.calculatedFine).toBe(0);
  });

  it('stacks with the fine for a home total under the limit', () => {
    const rows = [player({ userId: 'a', total: 610 }), player({ userId: 'b', total: 640 })];
    const derived = derivePlayers(points(3, 5, { teamTotalScore: 3700 }), rows).get('b')!;

    expect(derived.isTeamUnderLimit).toBe(true);
    expect(derived.isTeamLoss).toBe(true);
    expect(derived.calculatedFine).toBe(5 + 5);
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

  it('adds the season 13 limit and loss fines on top of the rest', () => {
    const rows = [
      player({
        userId: 'a', total: 590, faults: 2, specialFaultsCount: 1,
      }),
      player({ userId: 'b', total: 900 }),
    ];
    const match = {
      ...homeInterliga(3000, CURRENT_SEASON), teamMatchPoints: 2, opponentMatchPoints: 6,
    };
    const derived = derivePlayers(match, rows, { a: 0 }).get('a')!;

    // 3 (faults) + 1 (worst) + 1 (under 600) + 5 (special fault) + 5 (under limit) + 5 (loss)
    expect(derived.calculatedFine).toBe(20);
  });

  it('keeps the success gathering out of calculatedFine', () => {
    const rows = [player({ userId: 'a', total: 900 }), player({ userId: 'b', total: 950 })];
    const derived = derivePlayers(homeInterliga(4000), rows, { a: 5 }).get('a')!;

    expect(derived.calculatedFine).toBe(1); // worst player only
    expect(derived.streakFine).toBe(10);
  });
});

describe('success gathering (faultless streak)', () => {
  const PREVIOUS_SEASON = 12;

  const clean = (seasonId: number | null = CURRENT_SEASON) => ({ faults: 0, seasonId });
  const withFaults = (faults: number, seasonId: number | null = CURRENT_SEASON) => (
    { faults, seasonId }
  );

  it.each([[4, 0], [5, 10], [6, 10]])('a streak of %i costs %i €', (streak, expected) => {
    expect(streakFineFor(streak)).toBe(expected);
  });

  it('counts a first-ever faultless game as streak 1', () => {
    expect(faultlessStreaks([clean()])).toEqual([1]);
  });

  it.each([
    [0, CURRENT_SEASON, 0],
    [4, CURRENT_SEASON, 4],
    [5, CURRENT_SEASON, 5],
    [6, CURRENT_SEASON, 1],
    [9, CURRENT_SEASON, 4],
    [10, CURRENT_SEASON, 5],
    [11, CURRENT_SEASON, 1],
    [5, PREVIOUS_SEASON, 5],
    [6, PREVIOUS_SEASON, 6],
    [6, null, 6],
  ])('stores a run of %i in season %s as %i', (run, seasonId, expected) => {
    expect(storedStreak(run, seasonId)).toBe(expected);
  });

  it('fines the fifth faultless game and then starts the streak again', () => {
    const streaks = faultlessStreaks(Array.from({ length: 11 }, () => clean()));

    expect(streaks).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 10, 0, 0, 0, 0, 10, 0]);
  });

  it('resets a restarted streak on a fault like any other', () => {
    const streaks = faultlessStreaks([
      clean(), clean(), clean(), clean(), clean(), clean(), withFaults(1), clean(),
    ]);

    expect(streaks).toEqual([1, 2, 3, 4, 5, 1, 0, 1]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 10, 0, 0, 0]);
  });

  it('keeps fining every game from the fifth on before season 13', () => {
    const streaks = faultlessStreaks(Array.from({ length: 6 }, () => clean(PREVIOUS_SEASON)));

    expect(streaks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 10, 10]);
  });

  it('restarts the count after a fault', () => {
    const streaks = faultlessStreaks([
      clean(), clean(), withFaults(3), clean(), clean(),
    ]);

    expect(streaks).toEqual([1, 2, 0, 1, 2]);
  });

  it('only reaches five after a fault when four clean games follow it', () => {
    const streaks = faultlessStreaks([
      withFaults(1), clean(), clean(), clean(), clean(), clean(),
    ]);

    expect(streaks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 0, 10]);
  });

  it('treats a missing fault count as faultless', () => {
    const streaks = faultlessStreaks([
      { faults: null, seasonId: CURRENT_SEASON },
      { faults: null, seasonId: CURRENT_SEASON },
    ]);

    expect(streaks).toEqual([1, 2]);
  });

  it('restarts the count in a new season', () => {
    const streaks = faultlessStreaks([
      clean(PREVIOUS_SEASON), clean(PREVIOUS_SEASON), clean(PREVIOUS_SEASON),
      clean(), clean(),
    ]);

    expect(streaks).toEqual([1, 2, 3, 1, 2]);
    expect(streaks.map(streakFineFor)).toEqual([0, 0, 0, 0, 0]);
  });

  it('does not carry four clean games of the previous season into the fifth', () => {
    const streaks = faultlessStreaks([
      clean(PREVIOUS_SEASON), clean(PREVIOUS_SEASON),
      clean(PREVIOUS_SEASON), clean(PREVIOUS_SEASON),
      clean(),
    ]);

    expect(streaks).toEqual([1, 2, 3, 4, 1]);
    expect(streakFineFor(streaks[4])).toBe(0);
  });

  it('does not let a fault of the previous season offset the new one', () => {
    expect(faultlessStreaks([withFaults(3, PREVIOUS_SEASON), clean()])).toEqual([0, 1]);
  });

  it('counts a season with no id as a bucket of its own', () => {
    const streaks = faultlessStreaks([
      clean(null), clean(null), clean(), clean(null),
    ]);

    expect(streaks).toEqual([1, 2, 1, 3]);
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
    ['a manual tournament 8:0', {
      seasonId: 13, leagueId: tournamentId, teamMatchPoints: 8, opponentMatchPoints: 0,
    }, 10],
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
