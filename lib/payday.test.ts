import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  isReminderDay,
  nextHomeMatchDate,
  paydayDedupeKey,
  REMINDER_DAYS_BEFORE,
  type Fixture,
} from './payday';

// Bratislava is UTC+2 in summer, so an evening throw-off is still the same local day.
const NOW = new Date('2026-08-16T18:00:00Z');

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    date: new Date('2026-08-20T16:00:00Z'),
    isHome: true,
    teamTotalScore: null,
    ...overrides,
  };
}

describe('daysUntil', () => {
  it('counts calendar days, not elapsed hours', () => {
    // Late evening to early morning is under 12 hours but still the next day.
    expect(daysUntil(new Date('2026-08-17T04:00:00Z'), new Date('2026-08-16T21:00:00Z'))).toBe(1);
  });

  it('is zero for the same Bratislava day', () => {
    expect(daysUntil(new Date('2026-08-16T05:00:00Z'), NOW)).toBe(0);
  });

  it('goes negative for a day already past', () => {
    expect(daysUntil(new Date('2026-08-14T10:00:00Z'), NOW)).toBe(-2);
  });

  it('stays exact across the spring DST switch, when a day is 23 hours long', () => {
    // Europe/Bratislava jumps to summer time on 2026-03-29.
    const before = new Date('2026-03-27T12:00:00Z');
    const after = new Date('2026-03-31T12:00:00Z');

    expect(daysUntil(after, before)).toBe(4);
  });

  it('stays exact across the autumn DST switch, when a day is 25 hours long', () => {
    // Europe/Bratislava returns to winter time on 2026-10-25.
    const before = new Date('2026-10-23T12:00:00Z');
    const after = new Date('2026-10-27T12:00:00Z');

    expect(daysUntil(after, before)).toBe(4);
  });

  it('reads an instant just after Bratislava midnight as the new day', () => {
    // 22:30 UTC in summer is already 00:30 the next day in Bratislava.
    expect(daysUntil(new Date('2026-08-16T22:30:00Z'), new Date('2026-08-16T12:00:00Z'))).toBe(1);
  });
});

describe('nextHomeMatchDate', () => {
  it('returns null out of season, when there are no fixtures at all', () => {
    expect(nextHomeMatchDate([], NOW)).toBeNull();
  });

  it('ignores away fixtures, because nobody pays at the away alley', () => {
    expect(nextHomeMatchDate([fixture({ isHome: false })], NOW)).toBeNull();
  });

  it('ignores a match that has already been played', () => {
    expect(nextHomeMatchDate([fixture({ teamTotalScore: 3480 })], NOW)).toBeNull();
  });

  it('ignores fixtures in the past', () => {
    const past = fixture({ date: new Date('2026-08-10T16:00:00Z') });

    expect(nextHomeMatchDate([past], NOW)).toBeNull();
  });

  it('keeps a fixture later today', () => {
    const today = fixture({ date: new Date('2026-08-16T20:00:00Z') });

    expect(nextHomeMatchDate([today], NOW)).toEqual(today.date);
  });

  it('picks the earliest of several upcoming home fixtures', () => {
    const soon = fixture({ date: new Date('2026-08-18T16:00:00Z') });
    const later = fixture({ date: new Date('2026-09-05T16:00:00Z') });

    expect(nextHomeMatchDate([later, soon], NOW)).toEqual(soon.date);
  });

  it('survives a row with a missing or unparseable date', () => {
    const broken = [fixture({ date: null }), fixture({ date: new Date('nonsense') })];

    expect(nextHomeMatchDate(broken, NOW)).toBeNull();
  });
});

describe('isReminderDay', () => {
  it('never fires without a fixture to aim at', () => {
    expect(isReminderDay(null, NOW)).toBe(false);
  });

  it.each([
    ['three days out', 3, false],
    ['exactly two days out', REMINDER_DAYS_BEFORE, true],
    ['the day before', 1, false],
    ['the day itself', 0, false],
  ])('is %s', (_label, daysAhead, expected) => {
    const payday = new Date(NOW.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    expect(isReminderDay(payday, NOW)).toBe(expected);
  });

  it('fires on the reminder day whatever hour the cron runs', () => {
    const payday = new Date('2026-08-18T16:00:00Z');

    expect(isReminderDay(payday, new Date('2026-08-16T06:00:00Z'))).toBe(true);
    expect(isReminderDay(payday, new Date('2026-08-16T21:00:00Z'))).toBe(true);
  });
});

describe('paydayDedupeKey', () => {
  it('collapses any kick-off time on one day to a single key', () => {
    expect(paydayDedupeKey(new Date('2026-08-18T10:00:00Z')))
      .toBe(paydayDedupeKey(new Date('2026-08-18T19:00:00Z')));
  });

  it('treats a rescheduled fixture as a new deadline', () => {
    expect(paydayDedupeKey(new Date('2026-08-18T16:00:00Z'))).toBe('2026-08-18');
    expect(paydayDedupeKey(new Date('2026-08-25T16:00:00Z'))).toBe('2026-08-25');
  });
});
