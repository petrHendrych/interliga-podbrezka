import { describe, expect, it } from 'vitest';
import { buildFineChartPoints, type FineChartSource } from '@/lib/player-fine-chart';
import type { MatchChartFormatters } from '@/lib/match-chart';

interface Row extends FineChartSource {
  opponent: string;
}

function row(overrides: Partial<Row> & Pick<Row, 'matchId'>): Row {
  return {
    date: '2026-09-12T10:00:00.000Z',
    calculatedFine: 0,
    streakFine: 0,
    isPaid: false,
    substitutionRole: null,
    opponent: `Opponent ${overrides.matchId}`,
    ...overrides,
  };
}

const format: MatchChartFormatters<Row> = {
  date: (iso) => `date:${iso}`,
  shortDate: (iso) => `short:${iso}`,
  match: (r) => `vs ${r.opponent}`,
  league: (r) => `league:${r.matchId}`,
};

describe('buildFineChartPoints', () => {
  it.each([
    [5, 0, 5],
    [5, 10, 15],
    [0, 10, 10],
    [0, 0, 0],
    [0.34, 0, 0.34],
    [0.1, 0.2, 0.3],
    [0.33, 5, 5.33],
  ])('plots %s € calculated + %s € streak as %s €, the row\'s whole debt', (calculatedFine, streakFine, amount) => {
    const [point] = buildFineChartPoints([row({ matchId: 1, calculatedFine, streakFine })], format);
    expect(point.amount).toBe(amount);
  });

  it('orders the matches oldest first', () => {
    const points = buildFineChartPoints([
      row({ matchId: 3, date: '2026-10-03T10:00:00.000Z' }),
      row({ matchId: 1, date: '2026-09-05T10:00:00.000Z' }),
      row({ matchId: 2, date: '2026-09-19T10:00:00.000Z' }),
    ], format);
    expect(points.map((p) => p.matchId)).toEqual([1, 2, 3]);
  });

  it('drops a row without a date, which has no place on the axis', () => {
    const points = buildFineChartPoints([
      row({ matchId: 1, date: null, calculatedFine: 5 }),
      row({ matchId: 2 }),
    ], format);
    expect(points.map((p) => p.matchId)).toEqual([2]);
  });

  it('keeps two matches on the same day as separate points, in input order', () => {
    const points = buildFineChartPoints([
      row({ matchId: 7, date: '2026-09-12T14:00:00.000Z' }),
      row({ matchId: 8, date: '2026-09-12T14:00:00.000Z' }),
    ], format);
    expect(points.map((p) => p.matchId)).toEqual([7, 8]);
  });

  it.each([
    ['minor', true],
    ['major', false],
    [null, false],
    [undefined, false],
  ] as const)('flags substitutionRole %s as substitution: %s', (substitutionRole, isSubstitution) => {
    const [point] = buildFineChartPoints([row({ matchId: 1, substitutionRole })], format);
    expect(point.isSubstitution).toBe(isSubstitution);
  });

  it.each([true, false])('passes isPaid %s through', (isPaid) => {
    const [point] = buildFineChartPoints([row({ matchId: 1, isPaid })], format);
    expect(point.isPaid).toBe(isPaid);
  });

  it('labels each point through the formatters', () => {
    const [point] = buildFineChartPoints([row({ matchId: 4, opponent: 'Brezno' })], format);
    expect(point).toEqual({
      matchId: 4,
      amount: 0,
      isPaid: false,
      isSubstitution: false,
      dateLabel: 'date:2026-09-12T10:00:00.000Z',
      shortDateLabel: 'short:2026-09-12T10:00:00.000Z',
      matchLabel: 'vs Brezno',
      leagueLabel: 'league:4',
    });
  });

  it('returns no points for no rows', () => {
    expect(buildFineChartPoints([], format)).toEqual([]);
  });
});
