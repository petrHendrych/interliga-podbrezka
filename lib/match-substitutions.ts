/* eslint-disable no-console */
import {
  and, eq, inArray, isNotNull, sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './db';
import {
  matchPlayerResults, matchSubstitutions, matches, scrapedData, users,
} from './db/schema';
import { computeAverage, isOurTeam } from './sync-transform';
import {
  SUBSTITUTION_FIRST_SEASON_ID,
  THROWS_PER_LANE,
  type SheetSubstitution,
  type SubstitutionCandidate,
  type SubstitutionReview,
  type SubstitutionSource,
  changeLaneFaults,
  extractSubstitutionCandidates,
  splitPosition,
  toSheetSubstitution,
  toSubstitutionReview,
} from './substitutions';

/** One of our matches whose payload carries a `substitutions` list, however empty. */
export interface SubstitutionMatchInput {
  matchId: number;
  /** External ids of our lineUp, so an undone split can tell a starter from a substitute. */
  lineUpExternalIds: number[];
  candidates: SubstitutionCandidate[];
}

interface SplitRow {
  matchId: number;
  userId: string;
  full: number;
  clean: number;
  total: number;
  avg: string;
  faults: number;
  teamId: number | null;
  substitutionRole: string;
  positionTotal: number;
  positionShare: string;
}

const rowKey = (matchId: number, userId: string) => `${matchId}_${userId}`;

/**
 * Brings the shared positions of these matches in line with the API: stores each substitution,
 * rewrites the starter's whole row into the split pair, and undoes splits the API no longer
 * reports. Runs after both raw-score writers and before the recalculation, so neither writer can
 * leave a combined row behind. Paid rows are never deleted. Returns the mid-lane switches the
 * admin has to review.
 */
export async function syncSubstitutions(
  inputs: SubstitutionMatchInput[],
): Promise<SubstitutionReview[]> {
  if (inputs.length === 0) return [];

  const matchIds = inputs.map((input) => input.matchId);
  const candidates = inputs.flatMap((input) => input.candidates);

  const externalIds = [...new Set(inputs.flatMap((input) => [
    ...input.lineUpExternalIds,
    ...input.candidates.flatMap((c) => [c.starter.externalId, c.substitute.externalId]),
  ]))];
  const userRows = externalIds.length === 0 ? [] : await db
    .select({ id: users.id, externalPlayerId: users.externalPlayerId })
    .from(users)
    .where(inArray(users.externalPlayerId, externalIds));
  const userIdByExternalId = new Map(
    userRows.map((u) => [Number(u.externalPlayerId), u.id] as const),
  );

  const resolved = candidates.flatMap((candidate) => {
    const starterUserId = userIdByExternalId.get(candidate.starter.externalId);
    const substituteUserId = userIdByExternalId.get(candidate.substitute.externalId);
    if (!starterUserId || !substituteUserId) {
      console.warn(`Substitution ${candidate.substitutionId}: a player has no user yet, left whole.`);
      return [];
    }
    return [{ candidate, starterUserId, substituteUserId }];
  });

  const resolvedIds = resolved.map((r) => r.candidate.substitutionId);
  await db.delete(matchSubstitutions).where(and(
    inArray(matchSubstitutions.matchId, matchIds),
    resolvedIds.length > 0
      ? sql`${matchSubstitutions.id} NOT IN (${sql.join(resolvedIds.map((id) => sql`${id}`), sql`, `)})`
      : sql`true`,
  ));

  if (resolved.length > 0) {
    await db
      .insert(matchSubstitutions)
      .values(resolved.map(({ candidate, starterUserId, substituteUserId }) => ({
        id: candidate.substitutionId,
        matchId: candidate.matchId,
        starterUserId,
        substituteUserId,
        throwNumber: candidate.throwNumber,
        laneFaults: changeLaneFaults(candidate.throwNumber, candidate.lanes),
      })))
      .onConflictDoUpdate({
        target: matchSubstitutions.id,
        // The admin's split survives: sync only refreshes what the API owns.
        set: {
          matchId: sql`EXCLUDED.match_id`,
          starterUserId: sql`EXCLUDED.starter_user_id`,
          substituteUserId: sql`EXCLUDED.substitute_user_id`,
          throwNumber: sql`EXCLUDED.throw_number`,
          laneFaults: sql`EXCLUDED.lane_faults`,
          updatedAt: sql`NOW()`,
        },
      });
  }

  const storedSplits = resolvedIds.length === 0 ? [] : await db
    .select({ id: matchSubstitutions.id, split: matchSubstitutions.splitLaneSubstituteFaults })
    .from(matchSubstitutions)
    .where(inArray(matchSubstitutions.id, resolvedIds));
  const splitById = new Map(storedSplits.map((s) => [Number(s.id), s.split] as const));

  const desired = new Map<string, SplitRow>();
  const starterRowsToDrop: { matchId: number; userId: string }[] = [];

  resolved.forEach(({ candidate, starterUserId, substituteUserId }) => {
    const split = splitPosition({
      throwNumber: candidate.throwNumber,
      lanes: candidate.lanes,
      position: candidate.position,
      splitLaneSubstituteFaults: splitById.get(candidate.substitutionId) ?? null,
    });
    if (!split) {
      console.warn(`Substitution ${candidate.substitutionId}: no lane split in the payload, left whole.`);
      return;
    }

    const toRow = (userId: string, segment: NonNullable<typeof split.starter>): SplitRow => ({
      matchId: candidate.matchId,
      userId,
      full: segment.full,
      clean: segment.clean,
      total: segment.total,
      avg: String(computeAverage(segment.total)),
      faults: segment.faults,
      teamId: candidate.teamId,
      substitutionRole: segment.role,
      positionTotal: segment.positionTotal,
      positionShare: String(segment.positionShare),
    });

    if (split.starter) {
      desired.set(rowKey(candidate.matchId, starterUserId), toRow(starterUserId, split.starter));
    } else {
      starterRowsToDrop.push({ matchId: candidate.matchId, userId: starterUserId });
    }
    desired.set(
      rowKey(candidate.matchId, substituteUserId),
      toRow(substituteUserId, split.substitute),
    );
  });

  const lineUpUserIds = new Map(inputs.map((input) => [
    input.matchId,
    new Set(input.lineUpExternalIds.flatMap((id) => userIdByExternalId.get(id) ?? [])),
  ]));

  const sharedRows = await db
    .select({
      matchId: matchPlayerResults.matchId,
      userId: matchPlayerResults.userId,
      isPaid: matchPlayerResults.isPaid,
    })
    .from(matchPlayerResults)
    .where(and(
      inArray(matchPlayerResults.matchId, matchIds),
      isNotNull(matchPlayerResults.substitutionRole),
    ));

  const stale = sharedRows.filter((r) => !desired.has(rowKey(r.matchId, r.userId)));
  const toReset = stale.filter((r) => lineUpUserIds.get(r.matchId)?.has(r.userId));
  const toDelete = [
    ...stale.filter((r) => !lineUpUserIds.get(r.matchId)?.has(r.userId) && !r.isPaid),
    ...starterRowsToDrop,
  ];

  await Promise.all(toReset.map((r) => db
    .update(matchPlayerResults)
    .set({ substitutionRole: null, positionTotal: null, positionShare: null })
    .where(and(
      eq(matchPlayerResults.matchId, r.matchId),
      eq(matchPlayerResults.userId, r.userId),
    ))));

  await Promise.all(toDelete.map((r) => db
    .delete(matchPlayerResults)
    .where(and(
      eq(matchPlayerResults.matchId, r.matchId),
      eq(matchPlayerResults.userId, r.userId),
      sql`NOT COALESCE(${matchPlayerResults.isPaid}, false)`,
    ))));

  const rows = Array.from(desired.values());
  if (rows.length > 0) {
    await db
      .insert(matchPlayerResults)
      .values(rows)
      .onConflictDoUpdate({
        target: [matchPlayerResults.matchId, matchPlayerResults.userId],
        set: {
          full: sql`EXCLUDED.full`,
          clean: sql`EXCLUDED.clean`,
          total: sql`EXCLUDED.total`,
          avg: sql`EXCLUDED.avg`,
          faults: sql`EXCLUDED.faults`,
          teamId: sql`COALESCE(EXCLUDED.team_id, match_player_results.team_id)`,
          substitutionRole: sql`EXCLUDED.substitution_role`,
          positionTotal: sql`EXCLUDED.position_total`,
          positionShare: sql`EXCLUDED.position_share`,
        },
      });
  }

  return resolved.flatMap(({ candidate }) => toSubstitutionReview(candidate) ?? []);
}

/**
 * The substitution input of one stored `match_detail` payload, or null when the match is not
 * ours to split: no payload, a season before substitutions were split, or a snapshot taken before
 * the API was asked for `substitutions`.
 */
export function substitutionInputFor(
  matchId: number,
  data: SubstitutionSource & {
    homeTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
    awayTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
  },
  seasonId: number | null,
): SubstitutionMatchInput | null {
  if (seasonId === null || seasonId < SUBSTITUTION_FIRST_SEASON_ID) return null;

  const isHome = isOurTeam({
    clubId: data.homeTeam?.club?.id,
    teamId: data.homeTeam?.id,
    name: data.homeTeam?.club?.name || data.homeTeam?.name,
  });
  const teamKey = isHome ? 'home' : 'away';
  const opponentTeam = isHome ? data.awayTeam : data.homeTeam;
  const opponent = opponentTeam?.club?.name || opponentTeam?.name || '';

  const candidates = extractSubstitutionCandidates(data, teamKey, matchId, opponent);
  if (candidates === null) return null;

  return {
    matchId,
    lineUpExternalIds: (data.lineUp?.[teamKey] ?? []).flatMap((row) => row.player?.id ?? []),
    candidates,
  };
}

/** One match's shared positions, for the money sheet and the CLI. */
export async function getMatchSubstitutions(matchId: number): Promise<SheetSubstitution[]> {
  const starter = alias(users, 'starter');
  const substitute = alias(users, 'substitute');

  const rows = await db
    .select({
      id: matchSubstitutions.id,
      starterUserId: matchSubstitutions.starterUserId,
      starterName: starter.name,
      substituteUserId: matchSubstitutions.substituteUserId,
      substituteName: substitute.name,
      throwNumber: matchSubstitutions.throwNumber,
      laneFaults: matchSubstitutions.laneFaults,
      splitLaneSubstituteFaults: matchSubstitutions.splitLaneSubstituteFaults,
    })
    .from(matchSubstitutions)
    .innerJoin(starter, eq(matchSubstitutions.starterUserId, starter.id))
    .innerJoin(substitute, eq(matchSubstitutions.substituteUserId, substitute.id))
    .where(eq(matchSubstitutions.matchId, matchId))
    .orderBy(matchSubstitutions.throwNumber);

  return rows.map((row) => toSheetSubstitution({ ...row, id: Number(row.id) }));
}

/** Per match, the mid-lane switches whose lane faults still wait for the admin's split. */
export async function getPendingSubstitutionCounts(
  matchIds: number[],
): Promise<Map<number, number>> {
  if (matchIds.length === 0) return new Map();

  const rows = await db
    .select({
      matchId: matchSubstitutions.matchId,
      pending: sql<number>`COUNT(*)::int`,
    })
    .from(matchSubstitutions)
    .where(and(
      inArray(matchSubstitutions.matchId, matchIds),
      sql`${matchSubstitutions.splitLaneSubstituteFaults} IS NULL`,
      sql`${matchSubstitutions.laneFaults} > 0`,
      sql`(${matchSubstitutions.throwNumber} - 1) % ${THROWS_PER_LANE}::int <> 0`,
    ))
    .groupBy(matchSubstitutions.matchId);

  return new Map(rows.map((row) => [Number(row.matchId), Number(row.pending)]));
}

/** Stores the admin's split of a mid-lane lane's faults; the caller re-splits and recalculates. */
export async function setSubstituteLaneFaults(
  substitutionId: number,
  substituteLaneFaults: number,
): Promise<void> {
  await db
    .update(matchSubstitutions)
    .set({ splitLaneSubstituteFaults: substituteLaneFaults, updatedAt: new Date() })
    .where(eq(matchSubstitutions.id, substitutionId));
}

/** Re-splits one match from its stored payload, after the admin changed a fault split. */
export async function resplitMatchSubstitutions(matchId: number): Promise<void> {
  const [match] = await db
    .select({ seasonId: matches.seasonId })
    .from(matches)
    .where(eq(matches.externalId, matchId));
  const [snapshot] = await db
    .select({ data: scrapedData.data })
    .from(scrapedData)
    .where(and(eq(scrapedData.type, 'match_detail'), eq(scrapedData.externalId, matchId)));
  if (!match || !snapshot) return;

  const input = substitutionInputFor(
    matchId,
    snapshot.data as Parameters<typeof substitutionInputFor>[1],
    match.seasonId,
  );
  if (input) await syncSubstitutions([input]);
}
