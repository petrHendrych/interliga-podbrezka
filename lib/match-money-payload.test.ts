import { describe, it, expect } from 'vitest';
import { markAllPaidPayload, paymentPayload } from './match-money-payload';

describe('paymentPayload', () => {
  it('flips only isPaid for a fine target', () => {
    const payload = paymentPayload({ kind: 'fine', userId: 'u1' }, true);
    expect(payload).toEqual({ players: [{ userId: 'u1', isPaid: true }] });
    expect(payload.players?.[0]).not.toHaveProperty('isBonusPaid');
    expect(payload).not.toHaveProperty('trainerPayments');
  });

  it('flips only isBonusPaid for a bonus target and can mark it unpaid again', () => {
    const payload = paymentPayload({ kind: 'bonus', userId: 'u1' }, false);
    expect(payload).toEqual({ players: [{ userId: 'u1', isBonusPaid: false }] });
    expect(payload.players?.[0]).not.toHaveProperty('isPaid');
  });

  it('never touches miss counts', () => {
    const [update] = paymentPayload({ kind: 'fine', userId: 'u1' }, false).players ?? [];
    expect(update).not.toHaveProperty('fullFaults');
    expect(update).not.toHaveProperty('secondToLastFaults');
  });

  it('addresses a trainer payment by its row id', () => {
    expect(paymentPayload({ kind: 'trainer', paymentId: 8 }, true)).toEqual({
      trainerPayments: [{ id: 8, isPaid: true }],
    });
  });
});

describe('markAllPaidPayload', () => {
  it('returns an empty payload for no targets', () => {
    expect(markAllPaidPayload([])).toEqual({});
  });

  it('marks every fine target paid without touching bonus flags', () => {
    expect(markAllPaidPayload([
      { kind: 'fine', userId: 'u1' },
      { kind: 'fine', userId: 'u2' },
    ])).toEqual({
      players: [{ userId: 'u1', isPaid: true }, { userId: 'u2', isPaid: true }],
    });
  });

  it('merges a fine and a bonus target of the same user into one update', () => {
    expect(markAllPaidPayload([
      { kind: 'fine', userId: 'u1' },
      { kind: 'bonus', userId: 'u1' },
      { kind: 'bonus', userId: 'u2' },
    ])).toEqual({
      players: [
        { userId: 'u1', isPaid: true, isBonusPaid: true },
        { userId: 'u2', isBonusPaid: true },
      ],
    });
  });

  it('keeps trainer payments separate from player rows', () => {
    expect(markAllPaidPayload([
      { kind: 'trainer', paymentId: 8 },
      { kind: 'trainer', paymentId: 9 },
    ])).toEqual({
      trainerPayments: [{ id: 8, isPaid: true }, { id: 9, isPaid: true }],
    });
  });

  it('combines sections when targets are mixed', () => {
    expect(markAllPaidPayload([
      { kind: 'fine', userId: 'u1' },
      { kind: 'trainer', paymentId: 8 },
    ])).toEqual({
      players: [{ userId: 'u1', isPaid: true }],
      trainerPayments: [{ id: 8, isPaid: true }],
    });
  });

  it('combines everything in a complex allTargets scenario', () => {
    expect(markAllPaidPayload([
      { kind: 'fine', userId: 'u1' },
      { kind: 'bonus', userId: 'u1' },
      { kind: 'fine', userId: 'u2' },
      { kind: 'trainer', paymentId: 8 },
      { kind: 'trainer', paymentId: 9 },
    ])).toEqual({
      players: [
        { userId: 'u1', isPaid: true, isBonusPaid: true },
        { userId: 'u2', isPaid: true },
      ],
      trainerPayments: [{ id: 8, isPaid: true }, { id: 9, isPaid: true }],
    });
  });
});
