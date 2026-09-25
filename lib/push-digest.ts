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

export type PersonalPushEvent =
  | 'bonusEarned'
  | 'fineAdded'
  | 'streakWarning'
  | 'finePaid'
  | 'bonusPaid'
  | 'trainerPaid';

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

/** One player's row of a match sheet, as far as settling it is concerned. */
export interface SettlementPlayerRow {
  user_id: string;
  calculated_fine: number;
  streak_fine: number;
  bonus_received: number;
  is_paid: boolean;
  is_bonus_paid: boolean;
}

export interface SettlementTrainerRow {
  id: number;
  userId: string;
  amount: number;
  isPaid: boolean;
}

/** The slice of a `MatchSheet` the settlement digest reads, kept db-free on purpose. */
export interface SettlementSheet {
  match: { opponent: string | null };
  players: SettlementPlayerRow[];
  trainer_payments: SettlementTrainerRow[];
}

/**
 * Tells people their money was settled: a sheet read before and after a write, and every row
 * that went from unpaid to paid becomes a notification for its owner.
 *
 * Only the paid direction speaks — an undo is an admin correcting a mis-click. A player gets
 * one push per row (fine and bonus are separate news), so a bulk write still reaches each
 * player individually. A trainer's several condition rows of the same match collapse into one
 * push with the summed amount, because they are all the same "you paid for this match".
 */
export function deriveSettlementPushes(
  before: SettlementSheet,
  after: SettlementSheet,
): PersonalPush[] {
  const opponent = after.match.opponent ?? '';
  const playersBefore = new Map(before.players.map((player) => [player.user_id, player]));
  const trainersBefore = new Map(before.trainer_payments.map((payment) => [payment.id, payment]));

  const justPaid = (was: boolean | undefined, now: boolean) => was === false && now;

  const playerPushes = after.players.flatMap((player): PersonalPush[] => {
    const past = playersBefore.get(player.user_id);
    const pushes: PersonalPush[] = [];

    const fine = round(player.calculated_fine + player.streak_fine);
    if (justPaid(past?.is_paid, player.is_paid) && fine > 0) {
      pushes.push({ userId: player.user_id, event: 'finePaid', params: { amount: fine, opponent } });
    }

    const bonus = round(player.bonus_received);
    if (justPaid(past?.is_bonus_paid, player.is_bonus_paid) && bonus > 0) {
      pushes.push({ userId: player.user_id, event: 'bonusPaid', params: { amount: bonus, opponent } });
    }

    return pushes;
  });

  const trainerTotals = new Map<string, number>();
  after.trainer_payments.forEach((payment) => {
    const past = trainersBefore.get(payment.id);
    if (!justPaid(past?.isPaid, payment.isPaid) || payment.amount <= 0) return;
    trainerTotals.set(payment.userId, (trainerTotals.get(payment.userId) ?? 0) + payment.amount);
  });

  const trainerPushes = [...trainerTotals.entries()].map(([userId, amount]): PersonalPush => ({
    userId,
    event: 'trainerPaid',
    params: { amount: round(amount), opponent },
  }));

  return [...playerPushes, ...trainerPushes];
}

const PERSONAL_PUSH_EVENTS: PersonalPushEvent[] = [
  'bonusEarned', 'fineAdded', 'streakWarning', 'finePaid', 'bonusPaid', 'trainerPaid',
];

/**
 * Validates notifications that arrived over HTTP from the CLI. Returns null when the payload
 * is not a personal-push batch at all, so the caller can fall through to another shape.
 *
 * The values land inside a notification, so nothing here is taken on trust: only the
 * personal money events are accepted, and params are flattened to strings and numbers rather
 * than passed through — a nested object would reach `interpolate()` as "[object Object]".
 */
export function parsePersonalPushes(value: unknown): PersonalPush[] | null {
  if (!Array.isArray(value)) return null;

  const parsed = value.flatMap((entry): PersonalPush[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { userId, event, params } = entry as Record<string, unknown>;

    if (typeof userId !== 'string' || userId.length === 0) return [];
    if (!PERSONAL_PUSH_EVENTS.includes(event as PersonalPushEvent)) return [];

    const safeParams: Record<string, string | number> = {};
    Object.entries(params && typeof params === 'object' ? params : {}).forEach(([key, param]) => {
      if (typeof param === 'string' || typeof param === 'number') {
        safeParams[key] = param;
      }
    });

    return [{ userId, event: event as PersonalPushEvent, params: safeParams }];
  });

  return parsed;
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
