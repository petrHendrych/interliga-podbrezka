import { describe, expect, it } from 'vitest';
import {
  buildTrainerMatchRows,
  groupTrainerMatches,
  isUuid,
  summarizeTrainerMatches,
  trainerMatchStatus,
  type TrainerPaymentRow,
} from '@/lib/trainer-matches';

function row(
  matchId: number,
  date: string | null,
  payment: Partial<Pick<TrainerPaymentRow, 'conditionType' | 'amount' | 'isPaid'>> = {},
): TrainerPaymentRow {
  return {
    matchId,
    date,
    opponent: `Opponent ${matchId}`,
    isHome: true,
    leagueName: 'Interliga',
    leagueId: 368,
    teamTotalScore: 3850,
    isPlayed: true,
    conditionType: null,
    amount: 0,
    isPaid: false,
    ...payment,
  };
}

function fixture(matchId: number, date: string | null): TrainerPaymentRow {
  return { ...row(matchId, date), teamTotalScore: null, isPlayed: false };
}

const DATE = '2026-09-19T10:00:00.000Z';

describe('isUuid', () => {
  it.each([
    ['0f8fad5b-d9cb-469f-a165-70867728950e', true],
    ['0F8FAD5B-D9CB-469F-A165-70867728950E', true],
    ['abc', false],
    ['123', false],
    ['0f8fad5b-d9cb-469f-a165-70867728950e0', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});

describe('trainerMatchStatus', () => {
  it.each([
    [0, 0, 'none'],
    [10, 0, 'paid'],
    [0, 10, 'unpaid'],
    [10, 5, 'partial'],
  ])('paid %d, unpaid %d -> %s', (paid, unpaid, expected) => {
    expect(trainerMatchStatus(paid, unpaid)).toBe(expected);
  });
});

describe('groupTrainerMatches', () => {
  it('keeps a played match with no payment as a zero row', () => {
    const [match] = groupTrainerMatches([row(1, DATE)]);

    expect(match).toMatchObject({
      matchId: 1, payments: [], total: 0, paid: 0, unpaid: 0, status: 'none',
    });
  });

  it('folds every condition of one match into a single row', () => {
    const rows = groupTrainerMatches([
      row(1, DATE, { conditionType: 'score_bonus', amount: 15 }),
      row(1, DATE, { conditionType: 'zero_faults', amount: 10 }),
      row(1, DATE, { conditionType: 'elite_player', amount: 20 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total: 45, paid: 0, unpaid: 45, status: 'unpaid',
    });
  });

  it('counts a clean sweep into the match total', () => {
    const [match] = groupTrainerMatches([
      row(1, DATE, { conditionType: 'score_bonus', amount: 10 }),
      row(1, DATE, { conditionType: 'clean_sweep', amount: 10 }),
    ]);

    expect(match.total).toBe(20);
  });

  it('splits a partly paid match into paid and still owed', () => {
    const [match] = groupTrainerMatches([
      row(1, DATE, { conditionType: 'score_bonus', amount: 15, isPaid: true }),
      row(1, DATE, { conditionType: 'zero_faults', amount: 10 }),
    ]);

    expect(match).toMatchObject({
      total: 25, paid: 15, unpaid: 10, status: 'partial',
    });
  });

  it('marks a match paid once every condition is paid', () => {
    const [match] = groupTrainerMatches([
      row(1, DATE, { conditionType: 'score_bonus', amount: 15, isPaid: true }),
      row(1, DATE, { conditionType: 'zero_faults', amount: 10, isPaid: true }),
    ]);

    expect(match).toMatchObject({
      total: 25, paid: 25, unpaid: 0, status: 'paid',
    });
  });

  it('orders the conditions of a match the same way whatever the query returned', () => {
    const [match] = groupTrainerMatches([
      row(1, DATE, { conditionType: 'clean_sweep', amount: 10 }),
      row(1, DATE, { conditionType: 'unknown_rule', amount: 5 }),
      row(1, DATE, { conditionType: 'elite_player', amount: 10 }),
      row(1, DATE, { conditionType: 'zero_faults', amount: 10 }),
      row(1, DATE, { conditionType: 'score_bonus', amount: 10 }),
    ]);

    expect(match.payments.map((p) => p.conditionType)).toEqual([
      'score_bonus', 'zero_faults', 'elite_player', 'clean_sweep', 'unknown_rule',
    ]);
  });
});

describe('buildTrainerMatchRows', () => {
  function order(rows: TrainerPaymentRow[]) {
    return buildTrainerMatchRows(groupTrainerMatches(rows))
      .map((r) => [r.match.matchId, r.kind]);
  }

  it('lists played matches newest first with undated ones last', () => {
    expect(order([
      row(1, '2026-09-05T10:00:00.000Z'),
      row(2, null),
      row(3, '2026-09-19T10:00:00.000Z'),
      row(4, '2026-09-12T10:00:00.000Z'),
    ])).toEqual([[3, 'result'], [4, 'result'], [1, 'result'], [2, 'result']]);
  });

  it('puts the fixtures still ahead at the bottom, oldest first, whatever their dates', () => {
    expect(order([
      fixture(10, '2026-11-14T10:00:00.000Z'),
      row(1, '2026-09-05T10:00:00.000Z'),
      fixture(11, '2026-10-17T10:00:00.000Z'),
      row(2, '2026-09-19T10:00:00.000Z'),
      fixture(12, null),
    ])).toEqual([
      [2, 'result'],
      [1, 'result'],
      [11, 'notPlayedYet'],
      [10, 'notPlayedYet'],
      [12, 'notPlayedYet'],
    ]);
  });

  it('keeps a match holding a payment among the played ones even without a score', () => {
    const unscored = {
      ...fixture(5, '2026-10-17T10:00:00.000Z'), conditionType: 'score_bonus', amount: 10, isPaid: true,
    };

    expect(order([unscored, row(1, '2026-09-05T10:00:00.000Z')])).toEqual([
      [5, 'result'],
      [1, 'result'],
    ]);
  });
});

describe('summarizeTrainerMatches', () => {
  it('sums every match, zero rows and fixtures included', () => {
    const rows = groupTrainerMatches([
      fixture(9, '2026-11-14T10:00:00.000Z'),
      row(1, DATE, { conditionType: 'score_bonus', amount: 15, isPaid: true }),
      row(1, DATE, { conditionType: 'zero_faults', amount: 10 }),
      row(2, '2026-09-12T10:00:00.000Z'),
      row(3, '2026-09-05T10:00:00.000Z', { conditionType: 'score_bonus', amount: 20 }),
    ]);

    expect(summarizeTrainerMatches(rows)).toEqual({ total: 45, paid: 15, unpaid: 30 });
  });

  it('is zero for an empty season', () => {
    expect(summarizeTrainerMatches([])).toEqual({ total: 0, paid: 0, unpaid: 0 });
  });
});
