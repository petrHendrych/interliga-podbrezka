import { describe, expect, it } from 'vitest';
import {
  formatDateOnly,
  formatMatchDate,
  getStartOfBratislavaToday,
  isNextDay,
  parseUtcDate,
} from '@/lib/dates';

describe('parseUtcDate', () => {
  it('reads a naive API timestamp as UTC, not as machine-local time', () => {
    expect(parseUtcDate('2026-09-12 11:00:00').toISOString()).toBe('2026-09-12T11:00:00.000Z');
  });

  it('leaves an explicit zone alone', () => {
    expect(parseUtcDate('2026-09-12T11:00:00Z').toISOString()).toBe('2026-09-12T11:00:00.000Z');
    expect(parseUtcDate('2026-09-12T13:00:00+02:00').toISOString()).toBe('2026-09-12T11:00:00.000Z');
  });

  it('returns an invalid date for empty or malformed input', () => {
    expect(Number.isNaN(parseUtcDate('').getTime())).toBe(true);
    expect(Number.isNaN(parseUtcDate('not-a-date').getTime())).toBe(true);
  });
});

describe('getStartOfBratislavaToday', () => {
  it('returns the Bratislava calendar day tagged at UTC midnight', () => {
    // 21:30 UTC in winter is already 22:30 in Bratislava, still the same day.
    expect(getStartOfBratislavaToday(new Date('2026-01-15T21:30:00Z')).toISOString())
      .toBe('2026-01-15T00:00:00.000Z');
  });

  it('rolls over to the next day when Bratislava is already past midnight', () => {
    // 23:30 UTC in summer is 01:30 the next day in Bratislava.
    expect(getStartOfBratislavaToday(new Date('2026-07-15T23:30:00Z')).toISOString())
      .toBe('2026-07-16T00:00:00.000Z');
  });

  it('handles both DST switch days', () => {
    // CET -> CEST on 2026-03-29, CEST -> CET on 2026-10-25.
    expect(getStartOfBratislavaToday(new Date('2026-03-29T12:00:00Z')).toISOString())
      .toBe('2026-03-29T00:00:00.000Z');
    expect(getStartOfBratislavaToday(new Date('2026-10-25T12:00:00Z')).toISOString())
      .toBe('2026-10-25T00:00:00.000Z');
  });
});

describe('isNextDay', () => {
  it('is true only for consecutive Bratislava calendar days', () => {
    expect(isNextDay('2026-09-12 18:00:00', '2026-09-13 09:00:00')).toBe(true);
    expect(isNextDay('2026-09-12 09:00:00', '2026-09-12 18:00:00')).toBe(false);
    expect(isNextDay('2026-09-12 09:00:00', '2026-09-14 09:00:00')).toBe(false);
  });

  it('is false when the second date comes first', () => {
    expect(isNextDay('2026-09-13 09:00:00', '2026-09-12 09:00:00')).toBe(false);
  });

  it('stays true across a DST switch, where the day is not 24 hours long', () => {
    expect(isNextDay('2026-10-24 20:00:00', '2026-10-25 20:00:00')).toBe(true);
    expect(isNextDay('2026-03-28 20:00:00', '2026-03-29 20:00:00')).toBe(true);
  });

  it('is false when either date is unparsable', () => {
    expect(isNextDay('nonsense', '2026-09-13 09:00:00')).toBe(false);
    expect(isNextDay('2026-09-12 09:00:00', '')).toBe(false);
  });
});

describe('formatMatchDate / formatDateOnly', () => {
  it('renders in Bratislava time for the given locale', () => {
    // 11:00 UTC in September is 13:00 in Bratislava.
    expect(formatMatchDate('2026-09-12 11:00:00', 'sk')).toContain('13:00');
    expect(formatDateOnly('2026-09-12 11:00:00', 'sk')).toContain('2026');
  });

  it('returns the raw string when the date cannot be parsed', () => {
    expect(formatMatchDate('nonsense', 'sk')).toBe('nonsense');
    expect(formatDateOnly('nonsense', 'sk')).toBe('nonsense');
  });

  it('returns the raw string instead of throwing on an invalid locale', () => {
    expect(formatDateOnly('2026-09-12 11:00:00', 'not a locale')).toBe('2026-09-12 11:00:00');
  });
});
