import { desc, eq, isNotNull } from 'drizzle-orm';
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
  /** Success gathering, settled together with `calculated_fine` by `is_paid`. */
  streak_fine: number;
  bonus_received: number;
  is_paid: boolean;
  is_bonus_paid: boolean;
}

async function selectMatches(limit?: number): Promise<PlayedMatch[]> {
  // Fixtures are stored as soon as they are scheduled, so anything without a team
  // score has not been played yet and has no money to settle.
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
    .where(isNotNull(matches.teamTotalScore))
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

export async function getPlayedMatches(limit?: number): Promise<PlayedMatch[]> {
  return selectMatches(limit);
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
      streakFine: matchPlayerResults.streakFine,
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
    streak_fine: Number(r.streakFine || 0),
    bonus_received: Number(r.bonusReceived || 0),
    is_paid: Boolean(r.isPaid),
    is_bonus_paid: Boolean(r.isBonusPaid),
  }));
}
