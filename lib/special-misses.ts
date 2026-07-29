import sql from './db';
import { ensureSchema } from './db-utils';

let schemaEnsured = false;

async function autoEnsureSchema(): Promise<void> {
  if (!schemaEnsured) {
    await ensureSchema();
    schemaEnsured = true;
  }
}

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

export async function getPlayedMatches(): Promise<PlayedMatch[]> {
  const matches = await sql`
    SELECT external_id, date, opponent, is_home, location, team_total_score, opponent_total_score
    FROM matches
    ORDER BY date DESC
  `;
  return matches.map((m) => ({
    external_id: Number(m.external_id),
    date: m.date ? new Date(m.date as string | Date).toISOString() : null,
    opponent: (m.opponent as string) || null,
    is_home: m.is_home === null ? null : Boolean(m.is_home),
    location: (m.location as string) || null,
    team_total_score: m.team_total_score === null ? null : Number(m.team_total_score),
    opponent_total_score: m.opponent_total_score === null ? null : Number(m.opponent_total_score),
  }));
}

export async function getLastPlayedMatch(): Promise<PlayedMatch | null> {
  const matches = await getPlayedMatches();
  return matches.length > 0 ? matches[0] : null;
}

export async function getMatchPlayers(matchId: number): Promise<MatchPlayerResult[]> {
  await autoEnsureSchema();
  const rows = await sql`
    SELECT 
      mpr.match_id,
      mpr.user_id,
      u.name as user_name,
      mpr.full,
      mpr.clean,
      mpr.total,
      mpr.faults,
      COALESCE(mpr.full_faults_count, 0) as full_faults_count,
      COALESCE(mpr.second_to_last_faults_count, 0) as second_to_last_faults_count,
      COALESCE(mpr.special_faults_count, 0) as special_faults_count,
      COALESCE(mpr.calculated_fine, 0) as calculated_fine,
      COALESCE(mpr.bonus_received, 0) as bonus_received,
      mpr.is_paid,
      mpr.is_bonus_paid
    FROM match_player_results mpr
    JOIN users u ON mpr.user_id = u.id
    WHERE mpr.match_id = ${matchId}
    ORDER BY u.name ASC
  `;

  return rows.map((r) => ({
    match_id: Number(r.match_id),
    user_id: String(r.user_id),
    user_name: String(r.user_name),
    full: Number(r.full || 0),
    clean: Number(r.clean || 0),
    total: Number(r.total || 0),
    faults: Number(r.faults || 0),
    full_faults_count: Number(r.full_faults_count || 0),
    second_to_last_faults_count: Number(r.second_to_last_faults_count || 0),
    special_faults_count: Number(r.special_faults_count || 0),
    calculated_fine: Number(r.calculated_fine || 0),
    bonus_received: Number(r.bonus_received || 0),
    is_paid: Boolean(r.is_paid),
    is_bonus_paid: Boolean(r.is_bonus_paid),
  }));
}

export async function updatePlayerSpecialMisses(
  matchId: number,
  userId: string,
  fullFaults: number,
  secondToLastFaults: number,
): Promise<void> {
  await autoEnsureSchema();
  const totalSpecialFaults = fullFaults + secondToLastFaults;

  await sql`
    UPDATE match_player_results
    SET 
      full_faults_count = ${fullFaults},
      second_to_last_faults_count = ${secondToLastFaults},
      special_faults_count = ${totalSpecialFaults},
      calculated_fine = ((faults * (faults + 1)) / 2) + 
                        (CASE WHEN is_worst_player THEN 1 ELSE 0 END) + 
                        (CASE WHEN is_under_600 THEN 1 ELSE 0 END) +
                        (${totalSpecialFaults} * 5)
    WHERE match_id = ${matchId} AND user_id = ${userId}
  `;
}

export async function updatePlayerPaymentStatus(
  matchId: number,
  userId: string,
  isPaid: boolean,
  isBonusPaid: boolean,
): Promise<void> {
  await autoEnsureSchema();
  await sql`
    UPDATE match_player_results
    SET 
      is_paid = ${isPaid},
      is_bonus_paid = ${isBonusPaid}
    WHERE match_id = ${matchId} AND user_id = ${userId}
  `;
}
