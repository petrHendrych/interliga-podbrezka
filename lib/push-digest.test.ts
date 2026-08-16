import { describe, expect, it } from 'vitest';
import {
  dailyDedupeKey,
  derivePersonalPushes,
  findStuckScrape,
  SCRAPE_STUCK_AFTER_MS,
  STREAK_WARNING_AT,
  summariseNewResults,
  type NewMatchResult,
  type PlayerMoneySnapshot,
} from './push-digest';
import { STREAK_FINE, STREAK_LENGTH } from './money-rules';

const NOW = new Date('2026-08-16T12:00:00Z');

function lockHeldFor(ms: number) {
  return { value: 'locked', updatedAt: new Date(NOW.getTime() - ms) };
}

const HOUR = 60 * 60 * 1000;

describe('findStuckScrape', () => {
  it('says nothing when there is no lock row at all', () => {
    expect(findStuckScrape(null, NOW)).toBeNull();
  });

  it('says nothing about a released lock, however old', () => {
    const released = { value: 'released', updatedAt: new Date(NOW.getTime() - 10 * HOUR) };

    expect(findStuckScrape(released, NOW)).toBeNull();
  });

  it('says nothing about a lock with no timestamp', () => {
    expect(findStuckScrape({ value: 'locked', updatedAt: null }, NOW)).toBeNull();
  });

  it.each([
    ['just below the threshold', SCRAPE_STUCK_AFTER_MS - 1, false],
    ['exactly at the threshold', SCRAPE_STUCK_AFTER_MS, true],
    ['past the threshold', SCRAPE_STUCK_AFTER_MS + 1, true],
  ])('reports a lock held %s', (_label, heldForMs, expected) => {
    expect(findStuckScrape(lockHeldFor(heldForMs), NOW) !== null).toBe(expected);
  });

  it('rounds the age down to whole hours', () => {
    expect(findStuckScrape(lockHeldFor(2 * HOUR), NOW)?.hours).toBe(2);
    expect(findStuckScrape(lockHeldFor(2.9 * HOUR), NOW)?.hours).toBe(2);
    expect(findStuckScrape(lockHeldFor(26 * HOUR), NOW)?.hours).toBe(26);
  });

  it('keys the dedupe on the lock timestamp, so one stuck run is reported once', () => {
    const lock = lockHeldFor(5 * HOUR);
    const later = new Date(NOW.getTime() + 6 * HOUR);

    expect(findStuckScrape(lock, NOW)?.dedupeKey)
      .toBe(findStuckScrape(lock, later)?.dedupeKey);
  });

  it('treats a fresh lock from a new run as a different stuck run', () => {
    const first = findStuckScrape(lockHeldFor(5 * HOUR), NOW);
    const second = findStuckScrape(lockHeldFor(4 * HOUR), NOW);

    expect(first?.dedupeKey).not.toBe(second?.dedupeKey);
  });

  it('honours an injected threshold', () => {
    expect(findStuckScrape(lockHeldFor(HOUR), NOW, 30 * 60 * 1000)).not.toBeNull();
  });
});

describe('dailyDedupeKey', () => {
  it('collapses every moment of one UTC day onto the same key', () => {
    expect(dailyDedupeKey(new Date('2026-08-16T00:00:00Z')))
      .toBe(dailyDedupeKey(new Date('2026-08-16T23:59:59Z')));
  });

  it('separates consecutive days', () => {
    expect(dailyDedupeKey(new Date('2026-08-16T23:59:59Z'))).toBe('2026-08-16');
    expect(dailyDedupeKey(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17');
  });
});

function result(overrides: Partial<NewMatchResult> = {}): NewMatchResult {
  return {
    externalId: 44568,
    opponent: 'Trenčín',
    teamTotalScore: 3480,
    opponentTotalScore: 3390,
    ...overrides,
  };
}

describe('summariseNewResults', () => {
  it('says nothing when the sync brought no new result', () => {
    expect(summariseNewResults([])).toBeNull();
  });

  it('names the opponent and both scores for a single new result', () => {
    expect(summariseNewResults([result()])).toEqual({
      kind: 'single',
      opponent: 'Trenčín',
      ourScore: 3480,
      opponentScore: 3390,
    });
  });

  it('collapses a backfill into one count instead of a buzz per match', () => {
    const many = [result({ externalId: 1 }), result({ externalId: 2 }), result({ externalId: 3 })];

    expect(summariseNewResults(many)).toEqual({ kind: 'many', count: 3 });
  });

  it('survives a row with no opponent or scores rather than printing null', () => {
    const bare = result({ opponent: null, teamTotalScore: null, opponentTotalScore: null });

    expect(summariseNewResults([bare])).toEqual({
      kind: 'single',
      opponent: '',
      ourScore: 0,
      opponentScore: 0,
    });
  });

  it('keeps our score first, whichever side won', () => {
    const lost = summariseNewResults([result({ teamTotalScore: 3300, opponentTotalScore: 3500 })]);

    expect(lost).toMatchObject({ ourScore: 3300, opponentScore: 3500 });
  });
});

const PLAYER = 'a1b2c3d4-0000-0000-0000-000000000001';

function snapshot(overrides: Partial<PlayerMoneySnapshot> = {}): PlayerMoneySnapshot {
  return {
    userId: PLAYER,
    unpaidFines: 0,
    unpaidBonus: 0,
    faultlessStreak: 0,
    ...overrides,
  };
}

describe('derivePersonalPushes', () => {
  it('stays silent on the very first snapshot, so a backfill notifies nobody', () => {
    const after = [snapshot({ unpaidFines: 42, unpaidBonus: 40, faultlessStreak: 4 })];

    expect(derivePersonalPushes([], after)).toEqual([]);
  });

  it('announces a bonus that just appeared', () => {
    const pushes = derivePersonalPushes([snapshot()], [snapshot({ unpaidBonus: 40 })]);

    expect(pushes).toEqual([{ userId: PLAYER, event: 'bonusEarned', params: { amount: 40 } }]);
  });

  it('announces a new fine with the delta and the running total', () => {
    const pushes = derivePersonalPushes(
      [snapshot({ unpaidFines: 12 })],
      [snapshot({ unpaidFines: 19 })],
    );

    expect(pushes).toEqual([
      { userId: PLAYER, event: 'fineAdded', params: { amount: 7, total: 19 } },
    ]);
  });

  it('says nothing when a fine is settled, because unpaid money only ever drops', () => {
    const pushes = derivePersonalPushes(
      [snapshot({ unpaidFines: 19 })],
      [snapshot({ unpaidFines: 0 })],
    );

    expect(pushes).toEqual([]);
  });

  it('says nothing when a bonus is paid out', () => {
    const pushes = derivePersonalPushes(
      [snapshot({ unpaidBonus: 40 })],
      [snapshot({ unpaidBonus: 0 })],
    );

    expect(pushes).toEqual([]);
  });

  it('says nothing when nothing moved', () => {
    const unchanged = snapshot({ unpaidFines: 12, unpaidBonus: 40, faultlessStreak: 3 });

    expect(derivePersonalPushes([unchanged], [unchanged])).toEqual([]);
  });

  it.each([
    ['below the warning', STREAK_WARNING_AT - 1, false],
    ['at the warning', STREAK_WARNING_AT, true],
    ['past it, where the fine is already being charged', STREAK_LENGTH, false],
  ])('handles a streak %s', (_label, faultlessStreak, expected) => {
    const pushes = derivePersonalPushes([snapshot()], [snapshot({ faultlessStreak })]);

    expect(pushes.some((push) => push.event === 'streakWarning')).toBe(expected);
  });

  it('nudges about the streak once, not on every recalculation', () => {
    const at = snapshot({ faultlessStreak: STREAK_WARNING_AT });

    expect(derivePersonalPushes([at], [at])).toEqual([]);
  });

  it('names what the next clean game will cost, because the streak is fined not rewarded', () => {
    const pushes = derivePersonalPushes(
      [snapshot()],
      [snapshot({ faultlessStreak: STREAK_WARNING_AT })],
    );

    expect(pushes).toEqual([{
      userId: PLAYER,
      event: 'streakWarning',
      params: { streak: STREAK_WARNING_AT, amount: STREAK_FINE },
    }]);
  });

  it('sends one push per player, with good news outranking bad', () => {
    const before = [snapshot()];
    const after = [snapshot({
      unpaidFines: 6,
      unpaidBonus: 40,
      faultlessStreak: STREAK_WARNING_AT,
    })];

    expect(derivePersonalPushes(before, after)).toEqual([
      { userId: PLAYER, event: 'bonusEarned', params: { amount: 40 } },
    ]);
  });

  it('prefers a new fine over the streak nudge', () => {
    const after = [snapshot({ unpaidFines: 6, faultlessStreak: STREAK_WARNING_AT })];

    expect(derivePersonalPushes([snapshot()], after)).toEqual([
      { userId: PLAYER, event: 'fineAdded', params: { amount: 6, total: 6 } },
    ]);
  });

  it('treats a player with no earlier row as starting from zero', () => {
    const newcomer = 'a1b2c3d4-0000-0000-0000-000000000002';
    const before = [snapshot()];
    const after = [snapshot(), snapshot({ userId: newcomer, unpaidFines: 3 })];

    expect(derivePersonalPushes(before, after)).toEqual([
      { userId: newcomer, event: 'fineAdded', params: { amount: 3, total: 3 } },
    ]);
  });

  it('rounds cent drift away instead of pushing 6.999999999 €', () => {
    const pushes = derivePersonalPushes(
      [snapshot({ unpaidFines: 0.1 })],
      [snapshot({ unpaidFines: 7.1 })],
    );

    expect(pushes[0].params).toEqual({ amount: 7, total: 7.1 });
  });
});
