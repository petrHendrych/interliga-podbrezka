import { describe, expect, it } from 'vitest';
import { buildTrainerChartPoints } from '@/lib/trainer-payment-chart';
import {
  groupTrainerMatches,
  type TrainerMatchRow,
  type TrainerPaymentRow,
} from '@/lib/trainer-matches';
import type { MatchChartFormatters } from '@/lib/match-chart';

function row(
  matchId: number,
  overrides: Partial<TrainerPaymentRow> = {},
): TrainerPaymentRow {
  return {
    matchId,
    date: '2026-09-12T10:00:00.000Z',
    opponent: `Opponent ${matchId}`,
    isHome: true,
    leagueName: 'Interliga',
    leagueId: 368,
    teamTotalScore: 3850,
    isPlayed: true,
    conditionType: null,
    amount: 0,
    isPaid: false,
    ...overrides,
  };
}

const format: MatchChartFormatters<TrainerMatchRow> = {
  date: (iso) => `date:${iso}`,
  shortDate: (iso) => `short:${iso}`,
  match: (m) => `vs ${m.opponent}`,
  league: (m) => `league:${m.matchId}`,
};

function points(rows: TrainerPaymentRow[]) {
  return buildTrainerChartPoints(groupTrainerMatches(rows), format);
}

describe('buildTrainerChartPoints', () => {
  it('sums every payment of a match into one point', () => {
    const [point] = points([
      row(1, { conditionType: 'score_bonus', amount: 15 }),
      row(1, { conditionType: 'elite_player', amount: 20 }),
      row(1, { conditionType: 'clean_sweep', amount: 10 }),
    ]);
    expect(point.amount).toBe(45);
    expect(point.payments.map((p) => p.conditionType))
      .toEqual(['score_bonus', 'elite_player', 'clean_sweep']);
  });

  it('plots a played match without a payment as 0 € with no status', () => {
    const [point] = points([row(1)]);
    expect(point.amount).toBe(0);
    expect(point.status).toBe('none');
    expect(point.payments).toEqual([]);
  });

  it.each([
    [[true, true], 'paid', 0],
    [[false, false], 'unpaid', 25],
    [[true, false], 'partial', 10],
  ] as const)('carries paid flags %j as status %s with %s € still owed', (paidFlags, status, unpaid) => {
    const [point] = points([
      row(1, { conditionType: 'score_bonus', amount: 15, isPaid: paidFlags[0] }),
      row(1, { conditionType: 'zero_faults', amount: 10, isPaid: paidFlags[1] }),
    ]);
    expect(point.status).toBe(status);
    expect(point.unpaid).toBe(unpaid);
  });

  it('leaves out the fixtures still ahead', () => {
    const result = points([
      row(1),
      row(2, { isPlayed: false, date: '2026-10-12T10:00:00.000Z' }),
    ]);
    expect(result.map((p) => p.matchId)).toEqual([1]);
  });

  it('keeps an unscored match that already holds a payment, like the table does', () => {
    const result = points([
      row(1, { isPlayed: false, conditionType: 'score_bonus', amount: 10 }),
    ]);
    expect(result.map((p) => p.matchId)).toEqual([1]);
  });

  it('orders the matches oldest first and drops a match without a date', () => {
    const result = points([
      row(3, { date: '2026-10-03T10:00:00.000Z' }),
      row(9, { date: null, conditionType: 'score_bonus', amount: 10 }),
      row(1, { date: '2026-09-05T10:00:00.000Z' }),
      row(2, { date: '2026-09-19T10:00:00.000Z' }),
    ]);
    expect(result.map((p) => p.matchId)).toEqual([1, 2, 3]);
  });

  it('labels each point through the formatters', () => {
    const [point] = points([row(4, { opponent: 'Brezno' })]);
    expect(point).toEqual({
      matchId: 4,
      amount: 0,
      status: 'none',
      unpaid: 0,
      payments: [],
      dateLabel: 'date:2026-09-12T10:00:00.000Z',
      shortDateLabel: 'short:2026-09-12T10:00:00.000Z',
      matchLabel: 'vs Brezno',
      leagueLabel: 'league:4',
    });
  });

  it('returns no points for no matches', () => {
    expect(buildTrainerChartPoints([], format)).toEqual([]);
  });
});
