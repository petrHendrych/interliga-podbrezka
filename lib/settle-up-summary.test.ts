import { describe, expect, it } from 'vitest';
import {
  playerSettlementPush,
  selectStillOpen,
  settledAmounts,
  summarizePlayerSettlement,
  summarizeTrainerSettlement,
  trainerSettlementPush,
  type PlayerSettlementRow,
  type TrainerSettlementRow,
} from './settle-up-summary';

function row(overrides: Partial<PlayerSettlementRow>): PlayerSettlementRow {
  return {
    matchId: 1,
    opponent: 'Trenčín',
    fine: 0,
    bonus: 0,
    isPaid: false,
    isBonusPaid: false,
    needsFaultSplit: false,
    ...overrides,
  };
}

describe('summarizePlayerSettlement', () => {
  it('sums the unpaid fines and the bonuses not yet paid out', () => {
    const settlement = summarizePlayerSettlement([
      row({ matchId: 1, fine: 6 }),
      row({ matchId: 2, fine: 13, bonus: 40 }),
      row({ matchId: 3, fine: 1 }),
    ]);

    expect(settlement.fineMatchIds).toEqual([1, 2, 3]);
    expect(settlement.bonusMatchIds).toEqual([2]);
    expect(settlement.fines).toBe(20);
    expect(settlement.bonuses).toBe(40);
  });

  it('leaves out paid rows and rows that owe or earn nothing', () => {
    const settlement = summarizePlayerSettlement([
      row({ matchId: 1, fine: 6, isPaid: true }),
      row({ matchId: 2, bonus: 40, isBonusPaid: true }),
      row({ matchId: 3, fine: 0, bonus: 0 }),
      row({
        matchId: 4, fine: 3, isPaid: true, bonus: 40,
      }),
    ]);

    expect(settlement.fineMatchIds).toEqual([]);
    expect(settlement.bonusMatchIds).toEqual([4]);
    expect(settlement.fines).toBe(0);
    expect(settlement.bonuses).toBe(40);
  });

  it('adds shared cent amounts without floating-point drift', () => {
    const settlement = summarizePlayerSettlement([
      row({ matchId: 1, fine: 0.34, bonus: 13.34 }),
      row({ matchId: 2, fine: 0.33, bonus: 13.33 }),
      row({ matchId: 3, fine: 0.33, bonus: 13.33 }),
    ]);

    expect(settlement.fines).toBe(1);
    expect(settlement.bonuses).toBe(40);
    expect(settlement.net).toBe(-39);
  });

  it.each([
    { fine: 50, bonus: 40, net: 10 },
    { fine: 12, bonus: 40, net: -28 },
    { fine: 40, bonus: 40, net: 0 },
  ])('nets $fine € of fines against $bonus € of bonuses to $net €', ({ fine, bonus, net }) => {
    const settlement = summarizePlayerSettlement([
      row({ matchId: 1, fine }),
      row({ matchId: 2, bonus }),
    ]);

    expect(settlement.net).toBe(net);
  });

  it('reports a pending substitution split only on an unpaid fine row', () => {
    const settlement = summarizePlayerSettlement([
      row({
        matchId: 1, fine: 3, needsFaultSplit: true, opponent: 'Trenčín',
      }),
      row({
        matchId: 2, fine: 3, isPaid: true, needsFaultSplit: true, opponent: 'Prievidza',
      }),
      row({
        matchId: 3, bonus: 40, needsFaultSplit: true, opponent: 'Zvolen',
      }),
      row({ matchId: 4, fine: 1, opponent: 'Bratislava' }),
    ]);

    expect(settlement.pendingSplit).toEqual([{ matchId: 1, opponent: 'Trenčín' }]);
  });
});

describe('selectStillOpen', () => {
  const settlement = summarizePlayerSettlement([
    row({ matchId: 1, fine: 6 }),
    row({ matchId: 2, fine: 3, bonus: 40 }),
    row({ matchId: 3, fine: 1 }),
  ]);

  it('keeps the rows the dialog showed that are still open', () => {
    expect(selectStillOpen(settlement, { fineMatchIds: [1, 2, 3], bonusMatchIds: [2] }))
      .toEqual({ fineMatchIds: [1, 2, 3], bonusMatchIds: [2] });
  });

  it('drops rows settled elsewhere since the dialog opened', () => {
    expect(selectStillOpen(settlement, { fineMatchIds: [1, 4], bonusMatchIds: [5] }))
      .toEqual({ fineMatchIds: [1], bonusMatchIds: [] });
  });

  it('never adds a row the dialog did not show', () => {
    expect(selectStillOpen(settlement, { fineMatchIds: [2], bonusMatchIds: [] }))
      .toEqual({ fineMatchIds: [2], bonusMatchIds: [] });
  });
});

describe('settledAmounts', () => {
  it('sums only the selected rows that are still open', () => {
    const rows = [
      row({ matchId: 1, fine: 6 }),
      row({ matchId: 2, fine: 3, bonus: 40 }),
      row({ matchId: 3, fine: 1, isPaid: true }),
      row({ matchId: 4, fine: 10 }),
    ];

    expect(settledAmounts(rows, { fineMatchIds: [1, 2, 3], bonusMatchIds: [2] }))
      .toEqual({ fines: 9, bonuses: 40 });
  });
});

describe('summarizeTrainerSettlement', () => {
  const payment = (overrides: Partial<TrainerSettlementRow>): TrainerSettlementRow => ({
    id: 1, matchId: 1, amount: 10, isPaid: false, ...overrides,
  });

  it('sums the unpaid payments and counts the matches they come from', () => {
    expect(summarizeTrainerSettlement([
      payment({ id: 1, matchId: 1, amount: 15 }),
      payment({ id: 2, matchId: 1, amount: 20 }),
      payment({ id: 3, matchId: 2, amount: 10 }),
      payment({
        id: 4, matchId: 3, amount: 10, isPaid: true,
      }),
      payment({ id: 5, matchId: 4, amount: 0 }),
    ])).toEqual({ paymentIds: [1, 2, 3], matchCount: 2, total: 45 });
  });

  it('is empty when everything is paid', () => {
    expect(summarizeTrainerSettlement([payment({ isPaid: true })]))
      .toEqual({ paymentIds: [], matchCount: 0, total: 0 });
  });
});

describe('playerSettlementPush', () => {
  it.each([
    {
      fines: 12, bonuses: 40, expected: { event: 'moneySettled', params: { fines: 12, bonuses: 40 } },
    },
    { fines: 12, bonuses: 0, expected: { event: 'finesSettled', params: { fines: 12 } } },
    { fines: 0, bonuses: 40, expected: { event: 'bonusesSettled', params: { bonuses: 40 } } },
  ])('settling $fines € of fines and $bonuses € of bonuses sends $expected.event', ({ fines, bonuses, expected }) => {
    expect(playerSettlementPush('u1', fines, bonuses)).toEqual({ userId: 'u1', ...expected });
  });

  it('sends nothing when nothing was settled', () => {
    expect(playerSettlementPush('u1', 0, 0)).toBeNull();
  });
});

describe('trainerSettlementPush', () => {
  it('sends one push with the settled total', () => {
    expect(trainerSettlementPush('t1', 45)).toEqual({
      userId: 't1', event: 'trainerSettled', params: { amount: 45 },
    });
  });

  it('sends nothing for a zero total', () => {
    expect(trainerSettlementPush('t1', 0)).toBeNull();
  });
});
