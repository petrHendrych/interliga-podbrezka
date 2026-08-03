import {
  desc,
  eq,
  and,
  sql,
} from 'drizzle-orm';
import { db } from './db';
import { matches, matchPlayerResults, users } from './db/schema';

export interface PlayedMatch {
  external_id: number;
  date: string | null;
  opponent: string | null;
  is_home: boolean | null;
  location: string | null;
  team_total_score: number | null;
  opponent_total_score: number | null;
}

export interface MatchPlayerResult {
  match_id: number;
  user_id: string;
  user_name: string;
  full: number;
  clean: number;
  total: number;
  faults: number;
  full_faults_count: number;
  second_to_last_faults_count: number;
  special_faults_count: number;
  calculated_fine: number;
  bonus_received: number;
  is_paid: boolean;
  is_bonus_paid: boolean;
}

async function selectMatches(limit?: number): Promise<PlayedMatch[]> {
  const query = db
    .select({
      externalId: matches.externalId,
      date: matches.date,
      opponent: matches.opponent,
      isHome: matches.isHome,
      location: matches.location,
      teamTotalScore: matches.teamTotalScore,
      opponentTotalScore: matches.opponentTotalScore,
    })
    .from(matches)
    .orderBy(desc(matches.date));

  const result = limit ? await query.limit(limit) : await query;

  return result.map((m) => ({
    external_id: m.externalId,
    date: m.date ? new Date(m.date).toISOString() : null,
    opponent: m.opponent ?? null,
    is_home: m.isHome ?? null,
    location: m.location ?? null,
    team_total_score: m.teamTotalScore ?? null,
    opponent_total_score: m.opponentTotalScore ?? null,
  }));
}

export async function getPlayedMatches(): Promise<PlayedMatch[]> {
  return selectMatches();
}

export async function getLastPlayedMatch(): Promise<PlayedMatch | null> {
  const matchItems = await selectMatches(1);
  return matchItems[0] ?? null;
}

export async function getMatchPlayers(matchId: number): Promise<MatchPlayerResult[]> {
  const rows = await db
    .select({
      matchId: matchPlayerResults.matchId,
      userId: matchPlayerResults.userId,
      userName: users.name,
      full: matchPlayerResults.full,
      clean: matchPlayerResults.clean,
      total: matchPlayerResults.total,
      faults: matchPlayerResults.faults,
      fullFaultsCount: matchPlayerResults.fullFaultsCount,
      secondToLastFaultsCount: matchPlayerResults.secondToLastFaultsCount,
      specialFaultsCount: matchPlayerResults.specialFaultsCount,
      calculatedFine: matchPlayerResults.calculatedFine,
      bonusReceived: matchPlayerResults.bonusReceived,
      isPaid: matchPlayerResults.isPaid,
      isBonusPaid: matchPlayerResults.isBonusPaid,
    })
    .from(matchPlayerResults)
    .innerJoin(users, eq(matchPlayerResults.userId, users.id))
    .where(eq(matchPlayerResults.matchId, matchId));

  return rows.map((r) => ({
    match_id: Number(r.matchId),
    user_id: String(r.userId),
    user_name: String(r.userName),
    full: Number(r.full || 0),
    clean: Number(r.clean || 0),
    total: Number(r.total || 0),
    faults: Number(r.faults || 0),
    full_faults_count: Number(r.fullFaultsCount || 0),
    second_to_last_faults_count: Number(r.secondToLastFaultsCount || 0),
    special_faults_count: Number(r.specialFaultsCount || 0),
    calculated_fine: Number(r.calculatedFine || 0),
    bonus_received: Number(r.bonusReceived || 0),
    is_paid: Boolean(r.isPaid),
    is_bonus_paid: Boolean(r.isBonusPaid),
  }));
}

export async function updatePlayerSpecialMisses(
  matchId: number,
  userId: string,
  fullFaults: number,
  secondToLastFaults: number,
): Promise<void> {
  const totalSpecialFaults = fullFaults + secondToLastFaults;

  await db
    .update(matchPlayerResults)
    .set({
      fullFaultsCount: fullFaults,
      secondToLastFaultsCount: secondToLastFaults,
      specialFaultsCount: totalSpecialFaults,
      calculatedFine: sql`((COALESCE(${matchPlayerResults.faults}, 0) * (COALESCE(${matchPlayerResults.faults}, 0) + 1)) / 2) + 
        (CASE WHEN ${matchPlayerResults.isWorstPlayer} THEN 1 ELSE 0 END) + 
        (CASE WHEN ${matchPlayerResults.isUnder600} THEN 1 ELSE 0 END) +
        (${totalSpecialFaults} * 5)`,
    })
    .where(and(eq(matchPlayerResults.matchId, matchId), eq(matchPlayerResults.userId, userId)));
}

export async function updatePlayerPaymentStatus(
  matchId: number,
  userId: string,
  isPaid: boolean,
  isBonusPaid: boolean,
): Promise<void> {
  await db
    .update(matchPlayerResults)
    .set({
      isPaid,
      isBonusPaid,
    })
    .where(and(eq(matchPlayerResults.matchId, matchId), eq(matchPlayerResults.userId, userId)));
}
