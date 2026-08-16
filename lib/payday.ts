import { getStartOfBratislavaToday } from './dates';

/** Money changes hands at the alley, so the next home fixture is the deadline to settle up. */
export const REMINDER_DAYS_BEFORE = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Fixture {
  date: Date | null;
  isHome: boolean | null;
  /** A score means the match is already behind us. */
  teamTotalScore: number | null;
}

/**
 * Whole days between two instants, counted in Bratislava calendar days rather than in
 * elapsed hours — otherwise a DST switch makes the day before a fixture 23 or 25 hours long
 * and the reminder lands a day out.
 */
export function daysUntil(date: Date, now: Date): number {
  const from = getStartOfBratislavaToday(now).getTime();
  const to = getStartOfBratislavaToday(date).getTime();

  return Math.round((to - from) / DAY_MS);
}

/** The nearest home fixture still ahead of us, or null out of season. */
export function nextHomeMatchDate(fixtures: Fixture[], now: Date): Date | null {
  const upcoming = fixtures
    .filter((fixture): fixture is Fixture & { date: Date } => (
      fixture.isHome === true
      && fixture.date !== null
      && !Number.isNaN(fixture.date.getTime())
      && fixture.teamTotalScore === null
      && daysUntil(fixture.date, now) >= 0
    ))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcoming[0]?.date ?? null;
}

/** True on exactly one day, so the daily cron reminds once and not for a whole week. */
export function isReminderDay(payday: Date | null, now: Date): boolean {
  if (!payday) return false;

  return daysUntil(payday, now) === REMINDER_DAYS_BEFORE;
}

/** Keys the reminder to the fixture's own day: a rescheduled match is a new deadline. */
export function paydayDedupeKey(payday: Date): string {
  return getStartOfBratislavaToday(payday).toISOString().slice(0, 10);
}
