'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { db, sql } from './db';
import {
  matches, matchPlayerResults, matchSubstitutions, trainerPayments,
} from './db/schema';
import { getSession } from './session';
import { logActivity } from './activity-log';
import { updateSyncedData } from './cache';
import { recalculateAndDiffPlayerMoney, recalculateDerivedFinancials } from './sync';
import { sendPersonalMoneyPushes } from './push';
import {
  MANUAL_MATCH_ID_BASE,
  getManualLeagues,
  getTeamIdsForSeason,
  isManualMatchId,
} from './season-config';
import {
  type ManualMatchError,
  type ManualMatchInput,
  type ManualMatchPlayerInput,
  type ManualMatchPositionInput,
  type ManualMatchSubstitutionInput,
  validateManualMatch,
} from './validation/manual-match';
import { buildManualMatchRows } from './manual-match-rows';

const MATCHES_PATH = '/[lang]/admin/matches';

export type {
  ManualMatchError,
  ManualMatchInput,
  ManualMatchPlayerInput,
  ManualMatchPositionInput,
  ManualMatchSubstitutionInput,
};

export type ManualMatchResult =
  | { success: true; matchId: number }
  | { success: false; error: ManualMatchError };

/** Ids live in a reserved range, so the next one cannot collide with a scraped match. */
async function allocateMatchId(): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(external_id), ${MANUAL_MATCH_ID_BASE}) + 1 AS id
    FROM matches
    WHERE external_id >= ${MANUAL_MATCH_ID_BASE}
  `;
  return Number(rows[0].id);
}

/**
 * Manual substitutions share `match_substitutions` with the scraped ones, whose ids come from the
 * results API; the manual range keeps the two apart.
 */
async function allocateSubstitutionId(): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(id), ${MANUAL_MATCH_ID_BASE}) + 1 AS id
    FROM match_substitutions
    WHERE id >= ${MANUAL_MATCH_ID_BASE}
  `;
  return Number(rows[0].id);
}

export async function saveManualMatch(input: ManualMatchInput): Promise<ManualMatchResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  const validationError = validateManualMatch(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    let matchId: number;

    if (input.externalId !== undefined) {
      if (!isManualMatchId(input.externalId)) {
        return { success: false, error: 'notManual' };
      }
      const existing = await db
        .select({ externalId: matches.externalId })
        .from(matches)
        .where(eq(matches.externalId, input.externalId));
      if (existing.length === 0) {
        return { success: false, error: 'notFound' };
      }
      matchId = input.externalId;
    } else {
      matchId = await allocateMatchId();
    }

    const league = getManualLeagues(input.seasonId)
      .find((l) => l.leagueId === input.leagueId)!;

    const built = buildManualMatchRows(input.positions);
    const teamId = getTeamIdsForSeason(input.seasonId)[0] ?? null;
    const playerRows = built.players.map((p) => ({ ...p, matchId, teamId }));
    const { teamTotalScore } = built;

    const matchRow = {
      externalId: matchId,
      // Midday keeps the stored day stable across the Bratislava timezone offset.
      date: new Date(`${input.date}T12:00:00Z`),
      opponent: input.opponent.trim(),
      isHome: input.isHome,
      location: null,
      teamTotalScore,
      opponentTotalScore: input.opponentTotalScore,
      teamMatchPoints: input.teamMatchPoints,
      opponentMatchPoints: input.opponentMatchPoints,
      seasonId: input.seasonId,
      leagueName: league.name,
      round: null,
      leagueId: league.leagueId,
      updatedAt: new Date(),
    };

    // Unlike the sync, an edit must be able to clear a field, so no COALESCE here.
    await db
      .insert(matches)
      .values(matchRow)
      .onConflictDoUpdate({
        target: matches.externalId,
        set: {
          date: drizzleSql`EXCLUDED.date`,
          opponent: drizzleSql`EXCLUDED.opponent`,
          isHome: drizzleSql`EXCLUDED.is_home`,
          location: drizzleSql`EXCLUDED.location`,
          teamTotalScore: drizzleSql`EXCLUDED.team_total_score`,
          opponentTotalScore: drizzleSql`EXCLUDED.opponent_total_score`,
          teamMatchPoints: drizzleSql`EXCLUDED.team_match_points`,
          opponentMatchPoints: drizzleSql`EXCLUDED.opponent_match_points`,
          seasonId: drizzleSql`EXCLUDED.season_id`,
          leagueName: drizzleSql`EXCLUDED.league_name`,
          round: drizzleSql`EXCLUDED.round`,
          leagueId: drizzleSql`EXCLUDED.league_id`,
          updatedAt: drizzleSql`NOW()`,
        },
      });

    // Rewritten whole on every save, so a removed substitution leaves no link behind.
    await db.delete(matchSubstitutions).where(eq(matchSubstitutions.matchId, matchId));

    // Players dropped from the lineup during an edit must lose their result row.
    const keptIds = playerRows.map((p) => p.userId);
    await db.delete(matchPlayerResults).where(and(
      eq(matchPlayerResults.matchId, matchId),
      drizzleSql`${matchPlayerResults.userId} NOT IN (${drizzleSql.join(
        keptIds.map((id) => drizzleSql`${id}::uuid`),
        drizzleSql`, `,
      )})`,
    ));

    // Derived money columns are left untouched; the recalculation below owns them.
    await db
      .insert(matchPlayerResults)
      .values(playerRows)
      .onConflictDoUpdate({
        target: [matchPlayerResults.matchId, matchPlayerResults.userId],
        set: {
          full: drizzleSql`EXCLUDED.full`,
          clean: drizzleSql`EXCLUDED.clean`,
          total: drizzleSql`EXCLUDED.total`,
          avg: drizzleSql`EXCLUDED.avg`,
          faults: drizzleSql`EXCLUDED.faults`,
          teamId: drizzleSql`EXCLUDED.team_id`,
          substitutionRole: drizzleSql`EXCLUDED.substitution_role`,
          positionTotal: drizzleSql`EXCLUDED.position_total`,
          positionShare: drizzleSql`EXCLUDED.position_share`,
        },
      });

    if (built.substitutions.length > 0) {
      const firstId = await allocateSubstitutionId();
      await db.insert(matchSubstitutions).values(built.substitutions.map((s, i) => ({
        id: firstId + i,
        matchId,
        ...s,
        // Each player's faults are entered on their own; there is no lane to split.
        laneFaults: 0,
      })));
    }

    const personalPushes = await recalculateAndDiffPlayerMoney();

    updateSyncedData();
    revalidatePath(MATCHES_PATH, 'page');
    await sendPersonalMoneyPushes(personalPushes);
    logActivity('admin', 'saveManualMatch', {
      matchId, mode: input.externalId === undefined ? 'create' : 'edit',
    }, session.user);
    return { success: true, matchId };
  } catch (error) {
    console.error('Failed to save manual match:', error);
    return { success: false, error: 'unknown' };
  }
}

export async function deleteManualMatch(externalId: number): Promise<ManualMatchResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  if (!isManualMatchId(externalId)) {
    return { success: false, error: 'notManual' };
  }

  try {
    const existing = await db
      .select({ externalId: matches.externalId })
      .from(matches)
      .where(eq(matches.externalId, externalId));
    if (existing.length === 0) {
      return { success: false, error: 'notFound' };
    }

    // Neither foreign key cascades, so the children go first.
    await db.batch([
      db.delete(matchSubstitutions).where(eq(matchSubstitutions.matchId, externalId)),
      db.delete(trainerPayments).where(eq(trainerPayments.matchId, externalId)),
      db.delete(matchPlayerResults).where(eq(matchPlayerResults.matchId, externalId)),
      db.delete(matches).where(eq(matches.externalId, externalId)),
    ]);

    // A deletion only ever lowers what people owe, so the diff finds nothing to announce.
    await recalculateDerivedFinancials();

    updateSyncedData();
    revalidatePath(MATCHES_PATH, 'page');
    logActivity('admin', 'deleteManualMatch', { matchId: externalId }, session.user);
    return { success: true, matchId: externalId };
  } catch (error) {
    console.error('Failed to delete manual match:', error);
    return { success: false, error: 'unknown' };
  }
}
