/**
 * Decides what deserves a notification. Pure and db-free on purpose: the queries that feed it
 * are SQL and untestable, so every judgement call lives here where a test can reach it.
 */
import { STREAK_FINE, STREAK_LENGTH } from './money-rules';

/** A scrape that has held the lock this long never released it — the run died. */
export const SCRAPE_STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

export interface JobLock {
  value: string | null;
  updatedAt: Date | null;
}

export interface StuckScrape {
  hours: number;
  /** The lock timestamp, so the same stuck run is only ever reported once. */
  dedupeKey: string;
}

/**
 * `releaseLock()` runs in a `finally`, so a lock still marked `locked` hours later means the
 * function died mid-run — a timeout or a crash that no catch branch ever saw.
 */
export function findStuckScrape(
  lock: JobLock | null,
  now: Date,
  stuckAfterMs: number = SCRAPE_STUCK_AFTER_MS,
): StuckScrape | null {
  if (!lock || lock.value !== 'locked' || !lock.updatedAt) return null;

  const heldForMs = now.getTime() - lock.updatedAt.getTime();
  if (heldForMs < stuckAfterMs) return null;

  return {
    hours: Math.floor(heldForMs / (60 * 60 * 1000)),
    dedupeKey: lock.updatedAt.toISOString(),
  };
}

/** Groups repeated failures of the same day into one notification. */
export function dailyDedupeKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** A match that had no score before this sync and has one now. */
export interface NewMatchResult {
  externalId: number;
  opponent: string | null;
  teamTotalScore: number | null;
  opponentTotalScore: number | null;
}

/** One player's outstanding money and streak, read either side of a recalculation. */
export interface PlayerMoneySnapshot {
  userId: string;
  unpaidFines: number;
  unpaidBonus: number;
  faultlessStreak: number;
}

export type PersonalPushEvent = 'bonusEarned' | 'fineAdded' | 'streakWarning';

export interface PersonalPush {
  userId: string;
  event: PersonalPushEvent;
  params: Record<string, string | number>;
}

/**
 * The last free faultless game. The success gathering is a fine, not a reward: from the
 * fifth consecutive clean game on, every further one costs another `STREAK_FINE`.
 */
export const STREAK_WARNING_AT = STREAK_LENGTH - 1;

const EMPTY_SNAPSHOT = { unpaidFines: 0, unpaidBonus: 0, faultlessStreak: 0 };

function byUserId(snapshots: PlayerMoneySnapshot[]): Map<string, PlayerMoneySnapshot> {
  return new Map(snapshots.map((snapshot) => [snapshot.userId, snapshot]));
}

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Turns a before/after pair into at most one notification per player.
 *
 * Only increases are news: settling a fine lowers the unpaid total and must stay silent, and
 * because both sides count unpaid money only, a row someone already paid can never be
 * announced. Good news outranks bad, and both outrank the streak nudge.
 */
export function derivePersonalPushes(
  before: PlayerMoneySnapshot[],
  after: PlayerMoneySnapshot[],
): PersonalPush[] {
  // Nothing to compare against means this is the first sync of an empty database: every
  // player would look like they just earned everything they have ever earned.
  if (before.length === 0) return [];

  const previous = byUserId(before);

  return after.flatMap((current): PersonalPush[] => {
    const past = previous.get(current.userId) ?? { ...EMPTY_SNAPSHOT, userId: current.userId };

    const bonusDelta = round(current.unpaidBonus - past.unpaidBonus);
    if (bonusDelta > 0) {
      return [{
        userId: current.userId,
        event: 'bonusEarned' as const,
        params: { amount: bonusDelta },
      }];
    }

    const fineDelta = round(current.unpaidFines - past.unpaidFines);
    if (fineDelta > 0) {
      return [{
        userId: current.userId,
        event: 'fineAdded' as const,
        params: { amount: fineDelta, total: round(current.unpaidFines) },
      }];
    }

    if (current.faultlessStreak === STREAK_WARNING_AT
      && past.faultlessStreak !== STREAK_WARNING_AT) {
      return [{
        userId: current.userId,
        event: 'streakWarning' as const,
        params: { streak: current.faultlessStreak, amount: STREAK_FINE },
      }];
    }

    return [];
  });
}

export type ResultSummary =
  | { kind: 'single'; opponent: string; ourScore: number; opponentScore: number }
  | { kind: 'many'; count: number };

/**
 * One notification per sync, never one per match: a backfill can land a dozen results at once
 * and nobody wants a dozen buzzes. A single new result is worth naming, several are not.
 */
export function summariseNewResults(results: NewMatchResult[]): ResultSummary | null {
  if (results.length === 0) return null;
  if (results.length > 1) return { kind: 'many', count: results.length };

  const [result] = results;

  return {
    kind: 'single',
    opponent: result.opponent ?? '',
    ourScore: result.teamTotalScore ?? 0,
    opponentScore: result.opponentTotalScore ?? 0,
  };
}
