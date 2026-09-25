import { eq, and, inArray } from 'drizzle-orm';
import { db, sql } from './db';
import { matches, matchPlayerResults, trainerPayments } from './db/schema';
import { leagueCondition } from './db-utils';
import { recalculateAndDiffPlayerMoney } from './sync';
import { deriveSettlementPushes, type PersonalPush } from './push-digest';
import { getMatchPlayers, type MatchPlayerResult } from './special-misses';
import { getMatchTrainerPayments, type TrainerPayment } from './trainer-payments';
import type {
  PlayerMoneyUpdate, TrainerPaymentUpdate, MatchMoneyUpdates,
} from './match-money-payload';

export type { PlayerMoneyUpdate, TrainerPaymentUpdate, MatchMoneyUpdates } from './match-money-payload';

export interface MatchSheet {
  match: {
    external_id: number;
    date: string | null;
    opponent: string | null;
    is_home: boolean | null;
    location: string | null;
    league_id: number | null;
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
  /**
   * Whose own money moved or was settled, for the caller to deliver — see the note on the
   * function below.
   */
  personalPushes: PersonalPush[];
}

export type MatchMoneyErrorCode = 'notFound' | 'noBonus' | 'invalid' | 'unknown';

export class MatchMoneyError extends Error {
  constructor(message: string, readonly code: MatchMoneyErrorCode = 'unknown') {
    super(message);
    this.name = 'MatchMoneyError';
  }
}

export interface PlayedMatchMoneySummary {
  externalId: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueId: number | null;
  leagueName: string | null;
  teamTotalScore: number | null;
  opponentTotalScore: number | null;
  finesUnpaid: number;
  bonusesUnpaid: number;
  trainerUnpaid: number;
}

interface PlayedMatchMoneySummaryRow {
  external_id: number | string;
  date: string | Date | null;
  opponent: string | null;
  is_home: boolean | null;
  league_id: number | null;
  league_name: string | null;
  team_total_score: number | null;
  opponent_total_score: number | null;
  fines_unpaid: string | number;
  bonuses_unpaid: string | number;
  trainer_unpaid: string | number;
}

/**
 * Played matches of one season with what is still owed per match. Inside one match row the
 * whole `calculated_fine + streak_fine` is settled by the single `is_paid`, so the streak
 * fine is included here regardless of the league filter.
 */
export async function getPlayedMatchMoneySummaries(
  seasonId: number,
  leagueKey?: string,
): Promise<PlayedMatchMoneySummary[]> {
  const rows = (await sql`
    SELECT m.external_id, m.date, m.opponent, m.is_home, m.league_id, m.league_name,
           m.team_total_score, m.opponent_total_score,
           COALESCE((SELECT SUM(COALESCE(mpr.calculated_fine, 0) + COALESCE(mpr.streak_fine, 0))
                     FROM match_player_results mpr
                     WHERE mpr.match_id = m.external_id AND NOT COALESCE(mpr.is_paid, false)), 0) AS fines_unpaid,
           COALESCE((SELECT SUM(COALESCE(mpr.bonus_received, 0))
                     FROM match_player_results mpr
                     WHERE mpr.match_id = m.external_id AND NOT COALESCE(mpr.is_bonus_paid, false)), 0) AS bonuses_unpaid,
           COALESCE((SELECT SUM(tp.amount)
                     FROM trainer_payments tp
                     WHERE tp.match_id = m.external_id AND NOT COALESCE(tp.is_paid, false)), 0) AS trainer_unpaid
    FROM matches m
    WHERE m.season_id = ${seasonId} AND m.team_total_score IS NOT NULL ${leagueCondition(leagueKey)}
    ORDER BY m.date DESC
  `) as unknown as PlayedMatchMoneySummaryRow[];

  return rows.map((row) => ({
    externalId: Number(row.external_id),
    date: row.date ? new Date(row.date).toISOString() : null,
    opponent: row.opponent ?? null,
    isHome: row.is_home ?? null,
    leagueId: row.league_id ?? null,
    leagueName: row.league_name ?? null,
    teamTotalScore: row.team_total_score ?? null,
    opponentTotalScore: row.opponent_total_score ?? null,
    finesUnpaid: Number(row.fines_unpaid),
    bonusesUnpaid: Number(row.bonuses_unpaid),
    trainerUnpaid: Number(row.trainer_unpaid),
  }));
}

export async function getMatchSheet(matchId: number): Promise<MatchSheet> {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.externalId, matchId));

  if (!match) {
    throw new MatchMoneyError(`No match with external id ${matchId}.`, 'notFound');
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
      league_id: match.leagueId ?? null,
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
    throw new MatchMoneyError(`${label} must be a non-negative integer, got ${value}.`, 'invalid');
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
      throw new MatchMoneyError(`User ${update.userId} has no result row in match ${matchId}.`, 'notFound');
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
        'noBonus',
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
      throw new MatchMoneyError(
        `Trainer payment ${update.id} does not belong to match ${matchId}.`,
        'notFound',
      );
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
  const moneyPushes = playerResult.missesChanged
    ? await recalculateAndDiffPlayerMoney()
    : [];

  const after = await getMatchSheet(matchId);

  return {
    changes: [...playerResult.changes, ...trainerChanges],
    recalculated: playerResult.missesChanged,
    sheet: after,
    personalPushes: [...moneyPushes, ...deriveSettlementPushes(sheet, after)],
  };
}
