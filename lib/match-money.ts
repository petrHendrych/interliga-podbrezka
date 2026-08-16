import { eq, and, inArray } from 'drizzle-orm';
import { db } from './db';
import { matches, matchPlayerResults, trainerPayments } from './db/schema';
import { recalculateAndDiffPlayerMoney } from './sync';
import type { PersonalPush } from './push-digest';
import { getMatchPlayers, type MatchPlayerResult } from './special-misses';
import { getMatchTrainerPayments, type TrainerPayment } from './trainer-payments';

export interface MatchSheet {
  match: {
    external_id: number;
    date: string | null;
    opponent: string | null;
    is_home: boolean | null;
    location: string | null;
    league_name: string | null;
    round: number | null;
    team_total_score: number | null;
    opponent_total_score: number | null;
  };
  players: MatchPlayerResult[];
  trainer_payments: TrainerPayment[];
  totals: {
    fines: number;
    fines_unpaid: number;
    bonuses: number;
    bonuses_unpaid: number;
    trainer: number;
    trainer_unpaid: number;
  };
}

export interface PlayerMoneyUpdate {
  userId: string;
  fullFaults?: number;
  secondToLastFaults?: number;
  isPaid?: boolean;
  isBonusPaid?: boolean;
}

export interface TrainerPaymentUpdate {
  id: number;
  isPaid: boolean;
}

export interface MatchMoneyUpdates {
  players?: PlayerMoneyUpdate[];
  trainerPayments?: TrainerPaymentUpdate[];
}

export interface AppliedChange {
  who: string;
  what: string;
  from: string;
  to: string;
}

export interface ApplyResult {
  changes: AppliedChange[];
  recalculated: boolean;
  sheet: MatchSheet;
  /** Whose own money moved, for the caller to deliver — see the note on the function below. */
  personalPushes: PersonalPush[];
}

export class MatchMoneyError extends Error {}

export async function getMatchSheet(matchId: number): Promise<MatchSheet> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.externalId, matchId));

  if (!match) {
    throw new MatchMoneyError(`No match with external id ${matchId}.`);
  }

  const players = await getMatchPlayers(matchId);
  const payments = await getMatchTrainerPayments(matchId);

  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
  const owed = (player: MatchPlayerResult) => player.calculated_fine + player.streak_fine;

  return {
    match: {
      external_id: match.externalId,
      date: match.date ? new Date(match.date).toISOString() : null,
      opponent: match.opponent ?? null,
      is_home: match.isHome ?? null,
      location: match.location ?? null,
      league_name: match.leagueName ?? null,
      round: match.round ?? null,
      team_total_score: match.teamTotalScore ?? null,
      opponent_total_score: match.opponentTotalScore ?? null,
    },
    players,
    trainer_payments: payments,
    totals: {
      fines: sum(players.map(owed)),
      fines_unpaid: sum(players.filter((p) => !p.is_paid).map(owed)),
      bonuses: sum(players.map((p) => p.bonus_received)),
      bonuses_unpaid: sum(players.filter((p) => !p.is_bonus_paid).map((p) => p.bonus_received)),
      trainer: sum(payments.map((p) => p.amount)),
      trainer_unpaid: sum(payments.filter((p) => !p.isPaid).map((p) => p.amount)),
    },
  };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new MatchMoneyError(`${label} must be a non-negative integer, got ${value}.`);
  }
}

async function applyPlayerUpdates(
  matchId: number,
  updates: PlayerMoneyUpdate[],
  before: MatchPlayerResult[],
): Promise<{ changes: AppliedChange[]; missesChanged: boolean }> {
  const byUserId = new Map(before.map((player) => [player.user_id, player]));

  const plan = updates.map((update) => {
    const current = byUserId.get(update.userId);
    if (!current) {
      throw new MatchMoneyError(`User ${update.userId} has no result row in match ${matchId}.`);
    }

    const fullFaults = update.fullFaults ?? current.full_faults_count;
    const secondToLastFaults = update.secondToLastFaults ?? current.second_to_last_faults_count;
    assertNonNegativeInteger(fullFaults, `fullFaults for ${current.user_name}`);
    assertNonNegativeInteger(secondToLastFaults, `secondToLastFaults for ${current.user_name}`);

    const isPaid = update.isPaid ?? current.is_paid;
    const isBonusPaid = update.isBonusPaid ?? current.is_bonus_paid;

    if (isBonusPaid && current.bonus_received === 0) {
      throw new MatchMoneyError(
        `${current.user_name} has no bonus in this match, so isBonusPaid cannot be true.`,
      );
    }

    const missesDiffer = fullFaults !== current.full_faults_count
      || secondToLastFaults !== current.second_to_last_faults_count;
    const flagsDiffer = isPaid !== current.is_paid || isBonusPaid !== current.is_bonus_paid;

    return {
      current, fullFaults, secondToLastFaults, isPaid, isBonusPaid, missesDiffer, flagsDiffer,
    };
  }).filter((entry) => entry.missesDiffer || entry.flagsDiffer);

  const writes = plan.map((entry) => db
    .update(matchPlayerResults)
    .set({
      fullFaultsCount: entry.fullFaults,
      secondToLastFaultsCount: entry.secondToLastFaults,
      specialFaultsCount: entry.fullFaults + entry.secondToLastFaults,
      isPaid: entry.isPaid,
      isBonusPaid: entry.isBonusPaid,
    })
    .where(and(
      eq(matchPlayerResults.matchId, matchId),
      eq(matchPlayerResults.userId, entry.current.user_id),
    )));

  await Promise.all(writes);

  const changes = plan.flatMap((entry) => {
    const { current } = entry;
    const entryChanges: AppliedChange[] = [];

    if (entry.missesDiffer) {
      entryChanges.push({
        who: current.user_name,
        what: 'special misses (full / 2nd-to-last)',
        from: `${current.full_faults_count} / ${current.second_to_last_faults_count}`,
        to: `${entry.fullFaults} / ${entry.secondToLastFaults}`,
      });
    }
    if (entry.isPaid !== current.is_paid) {
      entryChanges.push({
        who: current.user_name,
        what: `fine ${current.calculated_fine + current.streak_fine}€`,
        from: current.is_paid ? 'paid' : 'unpaid',
        to: entry.isPaid ? 'paid' : 'unpaid',
      });
    }
    if (entry.isBonusPaid !== current.is_bonus_paid) {
      entryChanges.push({
        who: current.user_name,
        what: `bonus ${current.bonus_received}€`,
        from: current.is_bonus_paid ? 'paid out' : 'not paid out',
        to: entry.isBonusPaid ? 'paid out' : 'not paid out',
      });
    }
    return entryChanges;
  });

  return { changes, missesChanged: plan.some((entry) => entry.missesDiffer) };
}

async function applyTrainerUpdates(
  matchId: number,
  updates: TrainerPaymentUpdate[],
  before: TrainerPayment[],
): Promise<AppliedChange[]> {
  const byId = new Map(before.map((payment) => [payment.id, payment]));
  const changed = updates.filter((update) => {
    const current = byId.get(update.id);
    if (!current) {
      throw new MatchMoneyError(`Trainer payment ${update.id} does not belong to match ${matchId}.`);
    }
    return current.isPaid !== update.isPaid;
  });

  const paidIds = changed.filter((u) => u.isPaid).map((u) => u.id);
  const unpaidIds = changed.filter((u) => !u.isPaid).map((u) => u.id);

  if (paidIds.length > 0) {
    await db.update(trainerPayments)
      .set({ isPaid: true })
      .where(inArray(trainerPayments.id, paidIds));
  }
  if (unpaidIds.length > 0) {
    await db.update(trainerPayments)
      .set({ isPaid: false })
      .where(inArray(trainerPayments.id, unpaidIds));
  }

  return changed.map((update) => {
    const current = byId.get(update.id) as TrainerPayment;
    return {
      who: current.userName,
      what: `trainer payment ${current.conditionType} ${current.amount}€`,
      from: current.isPaid ? 'paid' : 'unpaid',
      to: update.isPaid ? 'paid' : 'unpaid',
    };
  });
}

/**
 * Writes money and recalculates, but neither invalidates nor notifies: it runs from
 * `scripts/match-money.ts`, outside Next, where `updateSyncedData()` throws and `lib/push.ts`
 * cannot even be imported. The caller owns both — the CLI calls
 * `requestSyncedDataRevalidation()` and posts `personalPushes` back over HTTP, an in-app
 * caller calls `updateSyncedData()` and `sendPersonalMoneyPushes()`.
 */
export async function applyMatchMoneyUpdates(
  matchId: number,
  updates: MatchMoneyUpdates,
): Promise<ApplyResult> {
  const sheet = await getMatchSheet(matchId);

  const playerResult = await applyPlayerUpdates(
    matchId,
    updates.players ?? [],
    sheet.players,
  );
  const trainerChanges = await applyTrainerUpdates(
    matchId,
    updates.trainerPayments ?? [],
    sheet.trainer_payments,
  );

  // Fines, streaks and trainer rows all derive from the miss counts, so one pass
  // after every write beats recalculating per player.
  const personalPushes = playerResult.missesChanged
    ? await recalculateAndDiffPlayerMoney()
    : [];

  return {
    changes: [...playerResult.changes, ...trainerChanges],
    recalculated: playerResult.missesChanged,
    sheet: await getMatchSheet(matchId),
    personalPushes,
  };
}
