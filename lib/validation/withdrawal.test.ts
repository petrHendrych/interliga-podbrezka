import { describe, expect, it } from 'vitest';
import { WITHDRAWAL_CATEGORIES } from '@/lib/withdrawal-categories';
import {
  type ValidWithdrawal,
  type WithdrawalInput,
  validateWithdrawal,
} from '@/lib/validation/withdrawal';

const NOW = new Date('2026-02-10T09:00:00Z');

function input(overrides: Partial<WithdrawalInput> = {}): WithdrawalInput {
  return {
    amount: '120.50',
    description: 'Obedy po zápase',
    category: 'food',
    date: '2026-02-09',
    ...overrides,
  };
}

function valid(overrides: Partial<WithdrawalInput> = {}): ValidWithdrawal {
  const result = validateWithdrawal(input(overrides), NOW);
  if (typeof result === 'string') throw new Error(`expected valid input, got ${result}`);
  return result;
}

describe('amount', () => {
  it.each(['', 'abc', '0', '-5', '10001'])('rejects %o', (amount) => {
    expect(validateWithdrawal(input({ amount }), NOW)).toBe('invalidAmount');
  });

  it('accepts the maximum of 10000', () => {
    expect(valid({ amount: '10000' }).amount).toBe(10000);
  });

  it('rounds to whole cents', () => {
    expect(valid({ amount: '12.345' }).amount).toBe(12.35);
  });
});

describe('description', () => {
  it('rejects fewer than 3 characters after trimming', () => {
    expect(validateWithdrawal(input({ description: 'ab' }), NOW)).toBe('invalidDescription');
    expect(validateWithdrawal(input({ description: '  a  ' }), NOW)).toBe('invalidDescription');
  });

  it('rejects more than 300 characters', () => {
    expect(validateWithdrawal(input({ description: 'x'.repeat(301) }), NOW))
      .toBe('invalidDescription');
  });

  it('accepts the 3 and 300 character boundaries and stores the trimmed text', () => {
    expect(valid({ description: ' abc ' }).description).toBe('abc');
    expect(valid({ description: 'x'.repeat(300) }).description).toHaveLength(300);
  });
});

describe('category', () => {
  it('rejects a category that is not on the list', () => {
    expect(validateWithdrawal(input({ category: 'yacht' }), NOW)).toBe('invalidCategory');
  });

  it.each(WITHDRAWAL_CATEGORIES)('accepts %s', (category) => {
    expect(valid({ category }).category).toBe(category);
  });
});

describe('date', () => {
  it.each(['', 'not-a-date'])('rejects %o', (date) => {
    expect(validateWithdrawal(input({ date }), NOW)).toBe('invalidDate');
  });

  it('rejects a date in the future', () => {
    expect(validateWithdrawal(input({ date: '2026-02-11' }), NOW)).toBe('invalidDate');
  });

  it('accepts today in Bratislava time', () => {
    expect(valid({ date: '2026-02-10' }).withdrawnAt.toISOString())
      .toBe('2026-02-10T12:00:00.000Z');
  });

  it('accepts today on a DST switch day', () => {
    const result = validateWithdrawal(
      input({ date: '2026-03-29' }),
      new Date('2026-03-29T10:00:00Z'),
    );
    expect(typeof result).not.toBe('string');
  });

  it('rejects a date outside every configured season', () => {
    expect(validateWithdrawal(input({ date: '2019-05-01' }), NOW)).toBe('invalidDate');
  });

  it('derives the season from the date, with a season starting in August', () => {
    // 2025/2026 is season 12 and opens on 1 August 2025; July still belongs to 2024/2025,
    // which is not configured, so it is rejected rather than filed under the wrong season.
    expect(validateWithdrawal(input({ date: '2025-07-31' }), NOW)).toBe('invalidDate');
    expect(valid({ date: '2025-08-01' }).seasonId).toBe(12);
    expect(valid({ date: '2026-02-09' }).seasonId).toBe(12);
  });
});
