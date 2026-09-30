import { describe, expect, it } from 'vitest';
import { toPlayedMatchMoneySummary, type PlayedMatchMoneySummaryRow } from './match-money';

const row: PlayedMatchMoneySummaryRow = {
  external_id: '44568',
  date: '2026-09-19T10:00:00.000Z',
  opponent: 'Trenčín',
  is_home: true,
  league_id: 368,
  league_name: 'Interliga',
  team_total_score: 3790,
  opponent_total_score: 3650,
  fines: '26',
  fines_unpaid: '13',
  bonuses: '40',
  bonuses_unpaid: '0',
  trainer: '10',
  trainer_unpaid: '10',
};

describe('toPlayedMatchMoneySummary', () => {
  it('turns Neon numeric strings into numbers for every total and unpaid part', () => {
    expect(toPlayedMatchMoneySummary(row)).toEqual({
      externalId: 44568,
      date: '2026-09-19T10:00:00.000Z',
      opponent: 'Trenčín',
      isHome: true,
      leagueId: 368,
      leagueName: 'Interliga',
      teamTotalScore: 3790,
      opponentTotalScore: 3650,
      fines: 26,
      finesUnpaid: 13,
      bonuses: 40,
      bonusesUnpaid: 0,
      trainer: 10,
      trainerUnpaid: 10,
    });
  });

  it('keeps half-euro amounts', () => {
    const summary = toPlayedMatchMoneySummary({ ...row, fines: '12.5', fines_unpaid: '2.5' });

    expect(summary.fines).toBe(12.5);
    expect(summary.finesUnpaid).toBe(2.5);
  });

  it('keeps missing match metadata as null', () => {
    const summary = toPlayedMatchMoneySummary({
      ...row, date: null, opponent: null, is_home: null, league_id: null,
    });

    expect(summary.date).toBeNull();
    expect(summary.opponent).toBeNull();
    expect(summary.isHome).toBeNull();
    expect(summary.leagueId).toBeNull();
  });
});
