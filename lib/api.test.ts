import { describe, expect, it } from 'vitest';
import { parseApiDate } from '@/lib/api';

describe('parseApiDate', () => {
  it('treats a naive results-API timestamp as UTC', () => {
    // Without the Z the machine zone would shift a 13:00 fixture to 11:00 or 15:00.
    expect(parseApiDate('2026-09-12 11:00:00').toISOString()).toBe('2026-09-12T11:00:00.000Z');
  });

  it('accepts a T separator', () => {
    expect(parseApiDate('2026-09-12T11:00:00').toISOString()).toBe('2026-09-12T11:00:00.000Z');
  });

  it('leaves an explicit offset alone', () => {
    expect(parseApiDate('2026-09-12T13:00:00+02:00').toISOString())
      .toBe('2026-09-12T11:00:00.000Z');
  });

  it('returns an invalid date for empty input instead of the epoch', () => {
    expect(Number.isNaN(parseApiDate('').getTime())).toBe(true);
  });
});
