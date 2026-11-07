import 'server-only';
import {
  and, eq, inArray, not, sql,
} from 'drizzle-orm';
import { db } from './db';
import {
  matchPlayerResults, matches, trainerPayments, users,
} from './db/schema';
import { getMatchSubstitutions } from './match-substitutions';
import type { PersonalPush } from './push-digest';
import {
  playerSettlementPush,
  selectStillOpen,
  settledAmounts,
  summarizePlayerSettlement,
  summarizeTrainerSettlement,
  trainerSettlementPush,
  type PlayerSettlement,
  type PlayerSettlementRow,
  type SettlementSelection,
  type TrainerSettlement,
} from './settle-up-summary';

export type SettleUpErrorCode = 'notFound' | 'pendingSplit' | 'nothingToSettle';

export class SettleUpError extends Error {
  constructor(message: string, readonly code: SettleUpErrorCode) {
    super(message);
    this.name = 'SettleUpError';
  }
}

export interface SettleUpResult {
  rows: number;
  push: PersonalPush | null;
}

async function pendingSplitMatchIds(userId: string, matchIds: number[]): Promise<Set<number>> {
  const pending = await Promise.all(matchIds.map(async (matchId) => {
    const substitutions = await getMatchSubstitutions(matchId);
    return substitutions.some((substitution) => substitution.needs_fault_split
      && (substitution.starter_user_id === userId || substitution.substitute_user_id === userId));
  }));
  return new Set(matchIds.filter((_, index) => pending[index]));
}

async function getPlayerSettlementRows(
  externalPlayerId: number,
  seasonId: number,
): Promise<{ userId: string; rows: PlayerSettlementRow[] } | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.externalPlayerId, externalPlayerId));
  if (!user) return null;

  const rows = await db
    .select({
      matchId: matchPlayerResults.matchId,
      opponent: matches.opponent,
      calculatedFine: matchPlayerResults.calculatedFine,
      streakFine: matchPlayerResults.streakFine,
      bonusReceived: matchPlayerResults.bonusReceived,
      isPaid: matchPlayerResults.isPaid,
      isBonusPaid: matchPlayerResults.isBonusPaid,
    })
    .from(matchPlayerResults)
    .innerJoin(matches, eq(matchPlayerResults.matchId, matches.externalId))
    .where(and(eq(matchPlayerResults.userId, user.id), eq(matches.seasonId, seasonId)))
    .orderBy(matches.date);

  const settlementRows = rows.map((row) => ({
    matchId: Number(row.matchId),
    opponent: row.opponent ?? null,
    fine: Number(row.calculatedFine ?? 0) + Number(row.streakFine ?? 0),
    bonus: Number(row.bonusReceived ?? 0),
    isPaid: Boolean(row.isPaid),
    isBonusPaid: Boolean(row.isBonusPaid),
    needsFaultSplit: false,
  }));

  const pending = await pendingSplitMatchIds(
    user.id,
    summarizePlayerSettlement(settlementRows).fineMatchIds,
  );

  return {
    userId: user.id,
    rows: settlementRows.map((row) => ({ ...row, needsFaultSplit: pending.has(row.matchId) })),
  };
}

/** Season-wide on purpose: `is_paid` settles a whole row, whichever league the page filters. */
export async function getPlayerSettlement(
  externalPlayerId: number,
  seasonId: number,
): Promise<PlayerSettlement | null> {
  const current = await getPlayerSettlementRows(externalPlayerId, seasonId);
  return current ? summarizePlayerSettlement(current.rows) : null;
}

export async function settlePlayer(
  externalPlayerId: number,
  seasonId: number,
  shown: SettlementSelection,
): Promise<SettleUpResult> {
  const current = await getPlayerSettlementRows(externalPlayerId, seasonId);
  if (!current) {
    throw new SettleUpError(`No player with external id ${externalPlayerId}.`, 'notFound');
  }

  const { userId, rows } = current;
  const settlement = summarizePlayerSettlement(rows);
  const selection = selectStillOpen(settlement, shown);
  if (selection.fineMatchIds.length === 0 && selection.bonusMatchIds.length === 0) {
    throw new SettleUpError(`Nothing left to settle for player ${externalPlayerId}.`, 'nothingToSettle');
  }

  const fineIds = new Set(selection.fineMatchIds);
  if (settlement.pendingSplit.some(({ matchId }) => fineIds.has(matchId))) {
    throw new SettleUpError(
      `Player ${externalPlayerId} still has a substitution split pending.`,
      'pendingSplit',
    );
  }

  // One transaction, and the NOT guards make a concurrent second settle a no-op.
  await db.batch([
    db.update(matchPlayerResults)
      .set({ isPaid: true })
      .where(and(
        eq(matchPlayerResults.userId, userId),
        inArray(matchPlayerResults.matchId, selection.fineMatchIds),
        not(sql`COALESCE(${matchPlayerResults.isPaid}, false)`),
      )),
    db.update(matchPlayerResults)
      .set({ isBonusPaid: true })
      .where(and(
        eq(matchPlayerResults.userId, userId),
        inArray(matchPlayerResults.matchId, selection.bonusMatchIds),
        not(sql`COALESCE(${matchPlayerResults.isBonusPaid}, false)`),
      )),
  ]);

  const { fines, bonuses } = settledAmounts(rows, selection);
  return {
    rows: selection.fineMatchIds.length + selection.bonusMatchIds.length,
    push: playerSettlementPush(userId, fines, bonuses),
  };
}

async function getTrainerSettlementRows(trainerId: string, seasonId: number) {
  const rows = await db
    .select({
      id: trainerPayments.id,
      matchId: trainerPayments.matchId,
      amount: trainerPayments.amount,
      isPaid: trainerPayments.isPaid,
    })
    .from(trainerPayments)
    .innerJoin(matches, eq(trainerPayments.matchId, matches.externalId))
    .where(and(eq(trainerPayments.userId, trainerId), eq(matches.seasonId, seasonId)));

  return rows.map((row) => ({
    id: Number(row.id),
    matchId: Number(row.matchId),
    amount: Number(row.amount),
    isPaid: Boolean(row.isPaid),
  }));
}

export async function getTrainerSettlement(
  trainerId: string,
  seasonId: number,
): Promise<TrainerSettlement> {
  return summarizeTrainerSettlement(await getTrainerSettlementRows(trainerId, seasonId));
}

export async function settleTrainer(
  trainerId: string,
  seasonId: number,
  shownPaymentIds: number[],
): Promise<SettleUpResult> {
  const rows = await getTrainerSettlementRows(trainerId, seasonId);
  const shown = new Set(shownPaymentIds);
  const open = summarizeTrainerSettlement(rows.filter((row) => shown.has(row.id)));

  if (open.paymentIds.length === 0) {
    throw new SettleUpError(`Nothing left to settle for trainer ${trainerId}.`, 'nothingToSettle');
  }

  await db.update(trainerPayments)
    .set({ isPaid: true })
    .where(and(
      eq(trainerPayments.userId, trainerId),
      inArray(trainerPayments.id, open.paymentIds),
      not(sql`COALESCE(${trainerPayments.isPaid}, false)`),
    ));

  return {
    rows: open.paymentIds.length,
    push: trainerSettlementPush(trainerId, open.total),
  };
}
