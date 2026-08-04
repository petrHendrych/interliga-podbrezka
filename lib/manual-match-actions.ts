'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { db, sql } from './db';
import { matches, matchPlayerResults, trainerPayments } from './db/schema';
import { getSession } from './session';
import { updateSyncedData } from './cache';
import { recalculateDerivedFinancials } from './sync';
import {
  MANUAL_MATCH_ID_BASE,
  getManualLeagues,
  getTeamIdsForSeason,
  isManualMatchId,
} from './season-config';

const MATCHES_PATH = '/[lang]/admin/matches';

/** A slot can be split between two players, so the squad can exceed six. */
const MAX_PLAYERS = 12;
const MAX_SCORE = 1000;
const MAX_FAULTS = 200;

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type ManualMatchError =
  | 'unauthorized'
  | 'invalidLeague'
  | 'invalidDate'
  | 'noPlayers'
  | 'duplicatePlayer'
  | 'invalidScore'
  | 'notFound'
  | 'notManual'
  | 'unknown';

export type ManualMatchResult =
  | { success: true; matchId: number }
  | { success: false; error: ManualMatchError };

export interface ManualMatchPlayerInput {
  userId: string;
  full: number;
  clean: number;
  faults: number;
}

export interface ManualMatchInput {
  /** Present → edit an existing manual match. */
  externalId?: number;
  seasonId: number;
  leagueId: number;
  /** `YYYY-MM-DD` from the date input. */
  date: string;
  opponent: string;
  isHome: boolean;
  opponentTotalScore: number | null;
  players: ManualMatchPlayerInput[];
}

function isCountable(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function validate(input: ManualMatchInput): ManualMatchError | null {
  const league = getManualLeagues(input.seasonId).find((l) => l.leagueId === input.leagueId);
  if (!league) return 'invalidLeague';

  const date = new Date(`${input.date}T12:00:00Z`);
  if (!input.date || Number.isNaN(date.getTime())) return 'invalidDate';

  if (input.players.length === 0 || input.players.length > MAX_PLAYERS) return 'noPlayers';
  if (input.players.some((p) => !p.userId)) return 'noPlayers';

  const uniqueIds = new Set(input.players.map((p) => p.userId));
  if (uniqueIds.size !== input.players.length) return 'duplicatePlayer';

  const scoresValid = input.players.every((p) => (
    isCountable(p.full, MAX_SCORE)
    && isCountable(p.clean, MAX_SCORE)
    && isCountable(p.faults, MAX_FAULTS)
  ));
  if (!scoresValid) return 'invalidScore';

  if (input.opponentTotalScore !== null
    && !isCountable(input.opponentTotalScore, MAX_SCORE * MAX_PLAYERS)) {
    return 'invalidScore';
  }

  return null;
}

/** Ids live in a reserved range, so the next one cannot collide with a scraped match. */
async function allocateMatchId(): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(MAX(external_id), ${MANUAL_MATCH_ID_BASE}) + 1 AS id
    FROM matches
    WHERE external_id >= ${MANUAL_MATCH_ID_BASE}
  `;
  return Number(rows[0].id);
}

export async function saveManualMatch(input: ManualMatchInput): Promise<ManualMatchResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  const validationError = validate(input);
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

    const playerRows = input.players.map((p) => {
      const total = p.full + p.clean;
      return {
        matchId,
        userId: p.userId,
        full: p.full,
        clean: p.clean,
        total,
        // Same formula the scraper falls back to when the API omits the average.
        avg: String(total > 0 ? Math.round((total / 4) * 10) / 10 : 0),
        faults: p.faults,
        teamId: getTeamIdsForSeason(input.seasonId)[0] ?? null,
      };
    });

    const teamTotalScore = playerRows.reduce((sum, p) => sum + p.total, 0);

    const matchRow = {
      externalId: matchId,
      // Midday keeps the stored day stable across the Bratislava timezone offset.
      date: new Date(`${input.date}T12:00:00Z`),
      opponent: input.opponent.trim(),
      isHome: input.isHome,
      location: null,
      teamTotalScore,
      opponentTotalScore: input.opponentTotalScore,
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
          seasonId: drizzleSql`EXCLUDED.season_id`,
          leagueName: drizzleSql`EXCLUDED.league_name`,
          round: drizzleSql`EXCLUDED.round`,
          leagueId: drizzleSql`EXCLUDED.league_id`,
          updatedAt: drizzleSql`NOW()`,
        },
      });

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
        },
      });

    await recalculateDerivedFinancials();

    updateSyncedData();
    revalidatePath(MATCHES_PATH, 'page');
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
      db.delete(trainerPayments).where(eq(trainerPayments.matchId, externalId)),
      db.delete(matchPlayerResults).where(eq(matchPlayerResults.matchId, externalId)),
      db.delete(matches).where(eq(matches.externalId, externalId)),
    ]);

    await recalculateDerivedFinancials();

    updateSyncedData();
    revalidatePath(MATCHES_PATH, 'page');
    return { success: true, matchId: externalId };
  } catch (error) {
    console.error('Failed to delete manual match:', error);
    return { success: false, error: 'unknown' };
  }
}
