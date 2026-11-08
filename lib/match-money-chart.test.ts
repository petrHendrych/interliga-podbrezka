import { describe, expect, it } from 'vitest';
import { buildMoneyChartPoints, type MoneyChartSource } from '@/lib/match-money-chart';
import type { MatchChartFormatters } from '@/lib/match-chart';

interface Row extends MoneyChartSource {
  opponent: string;
}

function row(overrides: Partial<Row> & Pick<Row, 'matchId'>): Row {
  return {
    date: '2026-09-12T10:00:00.000Z',
    teamTotalScore: 3800,
    opponentTotalScore: 3700,
    fines: 0,
    finesUnpaid: 0,
    trainer: 0,
    trainerUnpaid: 0,
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

describe('buildMoneyChartPoints', () => {
  it('turns the newest-first match list into oldest-first points', () => {
    const points = buildMoneyChartPoints([
      row({ matchId: 3, date: '2026-10-03T10:00:00.000Z' }),
      row({ matchId: 2, date: '2026-09-26T10:00:00.000Z' }),
      row({ matchId: 1, date: '2026-09-19T10:00:00.000Z' }),
    ], format);
    expect(points.map((p) => p.matchId)).toEqual([1, 2, 3]);
  });

  it('leaves a match without a date off the chart', () => {
    const points = buildMoneyChartPoints(
      [row({ matchId: 1 }), row({ matchId: 2, date: null })],
      format,
    );
    expect(points.map((p) => p.matchId)).toEqual([1]);
  });

  it('carries both money lines and their unpaid parts as the match card shows them', () => {
    const [point] = buildMoneyChartPoints([row({
      matchId: 1, fines: 23, finesUnpaid: 8, trainer: 15, trainerUnpaid: 15,
    })], format);
    expect(point).toMatchObject({
      players: 23, playersUnpaid: 8, trainer: 15, trainerUnpaid: 15,
    });
  });

  it.each([
    [0.1 + 0.2, 0.3],
    [0.33, 0.33],
    [13.33 + 0.34, 13.67],
    [0, 0],
  ])('rounds %s € to whole cents as %s €', (value, expected) => {
    const [point] = buildMoneyChartPoints([row({
      matchId: 1, fines: value, finesUnpaid: value, trainer: value, trainerUnpaid: value,
    })], format);
    expect(point).toMatchObject({
      players: expected, playersUnpaid: expected, trainer: expected, trainerUnpaid: expected,
    });
  });

  it('plots both team totals', () => {
    const [point] = buildMoneyChartPoints([row({
      matchId: 1, teamTotalScore: 3812, opponentTotalScore: 3650,
    })], format);
    expect(point).toMatchObject({ teamScore: 3812, opponentScore: 3650 });
  });

  it.each([
    [0, null],
    [null, null],
  ])('leaves a gap for a team total of %s', (total, expected) => {
    const [point] = buildMoneyChartPoints([row({
      matchId: 1, teamTotalScore: total, opponentTotalScore: total,
    })], format);
    expect(point).toMatchObject({ teamScore: expected, opponentScore: expected });
  });

  it('takes every label from the page formatters', () => {
    const [point] = buildMoneyChartPoints([row({ matchId: 7 })], format);
    expect(point).toMatchObject({
      dateLabel: 'date:2026-09-12T10:00:00.000Z',
      shortDateLabel: 'short:2026-09-12T10:00:00.000Z',
      matchLabel: 'vs Opponent 7',
      leagueLabel: 'league:7',
    });
  });
});
