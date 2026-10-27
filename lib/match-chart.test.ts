import { describe, expect, it } from 'vitest';
import {
  paymentStateRuns,
  scoreOrNull,
  type MatchPaymentState,
  type PaymentStateRun,
} from '@/lib/match-chart';

describe('scoreOrNull', () => {
  it.each<[number | null, number | null]>([
    [null, null],
    [0, null],
    [612, 612],
    [3912, 3912],
  ])('maps %s to %s', (score, expected) => {
    expect(scoreOrNull(score)).toBe(expected);
  });
});

describe('paymentStateRuns', () => {
  it.each<[string, MatchPaymentState[], PaymentStateRun[]]>([
    ['no matches', [], []],
    ['a single match, which has no segment', ['unpaid'], []],
    ['two matches, coloured by the first', ['paid', 'unpaid'], [
      { state: 'paid', start: 0, end: 1 },
    ]],
    ['an unpaid match colours the segment up to the next one', ['unpaid', 'paid', 'paid'], [
      { state: 'unpaid', start: 0, end: 0.5 },
      { state: 'paid', start: 0.5, end: 1 },
    ]],
    ['the last match never colours a segment', ['paid', 'paid', 'unpaid'], [
      { state: 'paid', start: 0, end: 1 },
    ]],
    ['a run of equal states merges into one', ['unpaid', 'unpaid', 'unpaid', 'paid', 'paid'], [
      { state: 'unpaid', start: 0, end: 0.75 },
      { state: 'paid', start: 0.75, end: 1 },
    ]],
    ['partly paid gets its own run', ['paid', 'partial', 'unpaid', 'paid'], [
      { state: 'paid', start: 0, end: 1 / 3 },
      { state: 'partial', start: 1 / 3, end: 2 / 3 },
      { state: 'unpaid', start: 2 / 3, end: 1 },
    ]],
  ])('%s', (_name, states, runs) => {
    expect(paymentStateRuns(states)).toEqual(runs);
  });
});
