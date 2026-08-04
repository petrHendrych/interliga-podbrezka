/* eslint-disable no-console */
import { unstable_cache } from 'next/cache';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import { db, sql } from './db';
import { scrapedData, systemStatus } from './db/schema';
import {
  DEFAULT_SEASON_ID,
  INTERLIGA_LEAGUE_IDS,
  POHAR_LEAGUE_IDS,
  TOURNAMENT_FILTER_KEY,
  TOURNAMENT_LEAGUE_IDS,
} from './season-config';
import { SYNCED_DATA_REVALIDATE_SECONDS } from './cache';
import { MatchListItem } from './api';

/**
 * @deprecated Database schema is managed via Drizzle Kit schema migrations (pnpm db:push).
 */
export async function ensureSchema() {
  // No-op: schema is managed declaratively via drizzle-kit
}

export async function upsertScrapedData(type: string, externalId: number, data: unknown) {
  if (data === undefined) {
    console.error(`Attempted to upsert undefined data for ${type}:${externalId}`);
    return;
  }

  try {
    const payload = typeof data === 'object' && data !== null ? data : { value: data };
    await db
      .insert(scrapedData)
      .values({
        type,
        externalId,
        data: payload as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [scrapedData.type, scrapedData.externalId],
        set: {
          data: payload as Record<string, unknown>,
          updatedAt: new Date(),
        },
        // Finished seasons get re-scraped weekly but never change.
        setWhere: drizzleSql`${scrapedData.data} IS DISTINCT FROM EXCLUDED.data`,
      });
  } catch (error) {
    console.error(`Failed to upsert ${type} for ID ${externalId}:`, error);
    throw error;
  }
}

export async function tryAcquireLock(
  jobName: string,
  timeoutMinutes: number = 30,
): Promise<boolean> {
  const lockName = `lock:${jobName}`;
  const now = new Date();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  try {
    const existing = await db
      .select({ value: systemStatus.value, updatedAt: systemStatus.updatedAt })
      .from(systemStatus)
      .where(eq(systemStatus.name, lockName));

    if (existing.length > 0 && existing[0].updatedAt) {
      const updatedAt = new Date(existing[0].updatedAt);
      const isExpired = (now.getTime() - updatedAt.getTime()) > timeoutMs;

      if (!isExpired && existing[0].value === 'locked') {
        console.log(`Lock ${jobName} is already held and not expired.`);
        return false;
      }
    }

    await db
      .insert(systemStatus)
      .values({
        name: lockName,
        value: 'locked',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemStatus.name,
        set: {
          value: 'locked',
          updatedAt: now,
        },
      });
    return true;
  } catch (error) {
    console.error(`Failed to acquire lock for ${jobName}:`, error);
    return false;
  }
}

export async function releaseLock(jobName: string): Promise<void> {
  const lockName = `lock:${jobName}`;
  try {
    await db
      .update(systemStatus)
      .set({ value: 'released', updatedAt: new Date() })
      .where(eq(systemStatus.name, lockName));
  } catch (error) {
    console.error(`Failed to release lock for ${jobName}:`, error);
  }
}

/** With `fields`, projects in Postgres so only those keys cross the wire. */
export async function getScrapedData<T>(
  type: string,
  externalId: number,
  fields?: string[],
): Promise<T | null> {
  const projection = fields && fields.length > 0
    // Keys are parameterised; `fields` cannot inject SQL.
    ? drizzleSql`jsonb_build_object(${drizzleSql.join(
      fields.map((f) => drizzleSql`${f}::text, ${scrapedData.data}->${f}`),
      drizzleSql`, `,
    )})`
    : scrapedData.data;

  try {
    const results = await db
      .select({ data: projection })
      .from(scrapedData)
      .where(and(eq(scrapedData.type, type), eq(scrapedData.externalId, externalId)))
      .limit(1);

    if (results.length === 0) return null;
    return results[0].data as T;
  } catch (error) {
    console.error(`Failed to get scraped data for ${type}:${externalId}`, error);
    throw error;
  }
}

export const getCachedPlayerName = unstable_cache(
  async (externalPlayerId: number) => getScrapedData<{ firstName?: string; lastName?: string }>(
    'player_detail',
    externalPlayerId,
    ['firstName', 'lastName'],
  ),
  ['player-detail'],
  { revalidate: SYNCED_DATA_REVALIDATE_SECONDS, tags: ['player-detail'] },
);

/** Ids come from `season-config`, so a raw list carries no injection risk. */
function idList(ids: number[]) {
  return sql.unsafe(ids.map(Number).join(', '));
}

/** Narrows to one league; expects the `matches` table aliased as `m`. */
function leagueCondition(leagueKey?: string) {
  if (leagueKey === 'interliga') {
    return sql`AND (m.league_id IN (${idList(INTERLIGA_LEAGUE_IDS)}) OR m.league_name ILIKE '%interliga%')`;
  }
  if (leagueKey === 'pohar') {
    return sql`AND (m.league_id IN (${idList(POHAR_LEAGUE_IDS)}) OR m.league_name ILIKE '%pohár%' OR m.league_name ILIKE '%pohar%' OR m.league_name ILIKE '%finále%' OR m.league_name ILIKE '%finale%')`;
  }
  // Manual competitions are always stamped by us, so no name fallback is needed.
  if (leagueKey === TOURNAMENT_FILTER_KEY) {
    return sql`AND m.league_id IN (${idList(TOURNAMENT_LEAGUE_IDS)})`;
  }
  return sql``;
}

export interface DBTrainerStats {
  id: string;
  name: string;
  count3800: number;
  count3900: number;
  zeroMisses: number;
  totalPaid: string;
}

export async function getTrainersWithStats(
  seasonId?: number,
  leagueKey?: string,
): Promise<DBTrainerStats[]> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const trainers = (await sql`
    SELECT 
      u.id::text, 
      u.name,
      COUNT(CASE WHEN m.external_id IS NOT NULL AND tp.condition_type = 'score_bonus' AND tp.amount = 10 THEN 1 END)::int as count3800,
      COUNT(CASE WHEN m.external_id IS NOT NULL AND tp.condition_type = 'score_bonus' AND tp.amount = 15 THEN 1 END)::int as count3900,
      COUNT(CASE WHEN m.external_id IS NOT NULL AND tp.condition_type = 'zero_faults' THEN 1 END)::int as "zeroMisses",
      (COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN tp.amount ELSE 0 END), 0)::text || ' €') as "totalPaid"
    FROM users u
    LEFT JOIN trainer_payments tp ON u.id = tp.user_id
    LEFT JOIN matches m ON tp.match_id = m.external_id 
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    WHERE u.role = 'trainer' AND u.is_approved = true
    GROUP BY u.id, u.name
    ORDER BY u.name ASC
  `) as unknown as DBTrainerStats[];
  return trainers;
}

export interface PlayerBalance {
  totalDue: number;
  totalBonuses: number;
  paidBonuses: number;
  totalPaid: number;
  balance: number;
}

export interface PlayerMatchResult {
  matchId: number;
  calculatedFine: number;
  bonusReceived: number;
  isPaid: boolean;
  isBonusPaid: boolean;
  faults: number;
  full: number;
  clean: number;
  total: number;
  avg: number;
  isWorstPlayer: boolean;
  isUnder600: boolean;
  isTeamUnder3750: boolean;
  fullFaultsCount: number;
  secondToLastFaultsCount: number;
  specialFaultsCount: number;
  faultlessStreak: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
  leagueId: number | null;
}

export interface PlayerSeasonBalance {
  externalPlayerId: number | null;
  name: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  totalDue: number;
  totalBonuses: number;
  totalPaid: number;
  balance: number;
  matchesCount: number;
  avgScore: number;
  maxScore: number;
  totalFaults: number;
}

export async function getPlayerBalances(
  seasonId?: number,
  leagueKey?: string,
): Promise<PlayerSeasonBalance[]> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const rows = await sql`
    SELECT 
      u.external_player_id,
      u.name,
      u.id::text as user_id,
      pd.first_name,
      pd.last_name,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.calculated_fine ELSE 0 END), 0)::text as total_due,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.bonus_received ELSE 0 END), 0)::text as total_bonuses,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL AND mpr.is_paid THEN mpr.calculated_fine ELSE 0 END), 0)::text as total_paid,
      (COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.calculated_fine ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL AND mpr.is_paid THEN mpr.calculated_fine ELSE 0 END), 0))::text as balance,
      COUNT(m.external_id)::text as matches_count,
      COALESCE(MAX(CASE WHEN m.external_id IS NOT NULL THEN mpr.total END), 0)::int as max_score,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.faults ELSE 0 END), 0)::int as total_faults,
      CASE 
        WHEN (
          (CASE WHEN COUNT(CASE WHEN m.external_id IS NOT NULL AND m.is_home = true THEN 1 END) > 0 THEN 1 ELSE 0 END) + 
          COUNT(CASE WHEN m.external_id IS NOT NULL AND (m.is_home = false OR m.is_home IS NULL) THEN 1 END)
        ) > 0 THEN (
          (CASE WHEN COUNT(CASE WHEN m.external_id IS NOT NULL AND m.is_home = true THEN 1 END) > 0 THEN 
            SUM(CASE WHEN m.external_id IS NOT NULL AND m.is_home = true THEN mpr.total ELSE 0 END)::numeric / COUNT(CASE WHEN m.external_id IS NOT NULL AND m.is_home = true THEN 1 END) 
          ELSE 0 END) + 
          SUM(CASE WHEN m.external_id IS NOT NULL AND (m.is_home = false OR m.is_home IS NULL) THEN mpr.total ELSE 0 END)::numeric
        ) / (
          (CASE WHEN COUNT(CASE WHEN m.external_id IS NOT NULL AND m.is_home = true THEN 1 END) > 0 THEN 1 ELSE 0 END) + 
          COUNT(CASE WHEN m.external_id IS NOT NULL AND (m.is_home = false OR m.is_home IS NULL) THEN 1 END)
        )
        ELSE 0 
      END::numeric as avg_score
    FROM users u
    LEFT JOIN LATERAL (
      SELECT sd.data->>'firstName' AS first_name, sd.data->>'lastName' AS last_name
      FROM scraped_data sd
      WHERE sd.type = 'player_detail' AND sd.external_id = u.external_player_id
      LIMIT 1
    ) pd ON true
    LEFT JOIN match_player_results mpr ON u.id = mpr.user_id
    LEFT JOIN matches m ON mpr.match_id = m.external_id
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    WHERE u.role = 'player' AND u.is_approved = true
    GROUP BY u.external_player_id, u.name, u.id, pd.first_name, pd.last_name
    ORDER BY u.name ASC
  `;

  return rows.map((r) => ({
    externalPlayerId: r.external_player_id ? Number(r.external_player_id) : null,
    name: String(r.name || 'Unknown'),
    userId: String(r.user_id),
    firstName: r.first_name ? String(r.first_name) : undefined,
    lastName: r.last_name ? String(r.last_name) : undefined,
    totalDue: Number(r.total_due || 0),
    totalBonuses: Number(r.total_bonuses || 0),
    totalPaid: Number(r.total_paid || 0),
    balance: Number(r.balance || 0),
    matchesCount: Number(r.matches_count || 0),
    avgScore: Math.round(Number(r.avg_score || 0) * 10) / 10,
    maxScore: Number(r.max_score || 0),
    totalFaults: Number(r.total_faults || 0),
  }));
}

export async function getPlayerBalanceByExternalId(
  externalPlayerId: number,
  seasonId?: number,
  leagueKey?: string,
): Promise<PlayerBalance> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const rows = await sql`
    SELECT 
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.calculated_fine ELSE 0 END), 0)::text as total_due,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.bonus_received ELSE 0 END), 0)::text as total_bonuses,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL AND mpr.is_bonus_paid THEN mpr.bonus_received ELSE 0 END), 0)::text as paid_bonuses,
      COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL AND mpr.is_paid THEN mpr.calculated_fine ELSE 0 END), 0)::text as total_paid,
      (COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL THEN mpr.calculated_fine ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN m.external_id IS NOT NULL AND mpr.is_paid THEN mpr.calculated_fine ELSE 0 END), 0))::text as balance
    FROM users u
    LEFT JOIN match_player_results mpr ON u.id = mpr.user_id
    LEFT JOIN matches m ON mpr.match_id = m.external_id 
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    WHERE u.external_player_id = ${externalPlayerId}
    GROUP BY u.external_player_id
  `;
  if (rows.length === 0) {
    return {
      totalDue: 0,
      totalBonuses: 0,
      paidBonuses: 0,
      totalPaid: 0,
      balance: 0,
    };
  }
  return {
    totalDue: Number(rows[0].total_due || 0),
    totalBonuses: Number(rows[0].total_bonuses || 0),
    paidBonuses: Number(rows[0].paid_bonuses || 0),
    totalPaid: Number(rows[0].total_paid || 0),
    balance: Number(rows[0].balance || 0),
  };
}

export const getCachedPlayerBalance = unstable_cache(
  async (playerId: number, seasonId: number, leagueKey: string) => (
    getPlayerBalanceByExternalId(playerId, seasonId, leagueKey)
  ),
  ['player-balance'],
  { revalidate: SYNCED_DATA_REVALIDATE_SECONDS, tags: ['player-balance'] },
);

export async function getPlayerMatchResultsByExternalId(
  externalPlayerId: number,
  seasonId?: number,
  leagueKey?: string,
): Promise<PlayerMatchResult[]> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const rows = await sql`
    SELECT 
      mpr.match_id,
      mpr.calculated_fine,
      mpr.bonus_received,
      mpr.is_paid,
      mpr.is_bonus_paid,
      mpr.faults,
      mpr."full",
      mpr.clean,
      mpr.total,
      mpr.avg,
      mpr.is_worst_player,
      mpr.is_under_600,
      mpr.is_team_under_3750,
      COALESCE(mpr.full_faults_count, 0) as full_faults_count,
      COALESCE(mpr.second_to_last_faults_count, 0) as second_to_last_faults_count,
      COALESCE(mpr.special_faults_count, 0) as special_faults_count,
      COALESCE(mpr.faultless_streak, 0) as faultless_streak,
      m.date,
      m.opponent,
      m.is_home,
      m.league_name,
      m.league_id
    FROM match_player_results mpr
    JOIN users u ON mpr.user_id = u.id
    JOIN matches m ON mpr.match_id = m.external_id
    WHERE u.external_player_id = ${externalPlayerId}
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    ORDER BY m.date DESC
  `;

  return rows.map((r) => {
    const matchId = Number(r.match_id);
    return {
      matchId,
      calculatedFine: Number(r.calculated_fine || 0),
      bonusReceived: Number(r.bonus_received || 0),
      isPaid: Boolean(r.is_paid),
      isBonusPaid: Boolean(r.is_bonus_paid),
      faults: Number(r.faults || 0),
      full: Number(r.full || 0),
      clean: Number(r.clean || 0),
      total: Number(r.total || 0),
      avg: Number(r.avg || 0),
      isWorstPlayer: Boolean(r.is_worst_player),
      isUnder600: Boolean(r.is_under_600),
      isTeamUnder3750: Boolean(r.is_team_under_3750),
      fullFaultsCount: Number(r.full_faults_count || 0),
      secondToLastFaultsCount: Number(r.second_to_last_faults_count || 0),
      specialFaultsCount: Number(r.special_faults_count || 0),
      faultlessStreak: Number(r.faultless_streak || 0),
      date: r.date ? new Date(r.date as string | Date).toISOString() : null,
      opponent: (r.opponent as string) || null,
      isHome: r.is_home === null ? null : Boolean(r.is_home),
      leagueName: (r.league_name as string) || null,
      leagueId: r.league_id != null ? Number(r.league_id) : null,
    };
  });
}

export const getCachedPlayerMatchResults = unstable_cache(
  async (playerId: number, seasonId: number, leagueKey: string) => (
    getPlayerMatchResultsByExternalId(playerId, seasonId, leagueKey)
  ),
  ['player-match-results'],
  { revalidate: SYNCED_DATA_REVALIDATE_SECONDS, tags: ['player-match-results'] },
);

export async function getMatchesByTeamId(
  teamId: number,
  seasonId: number,
  leagueIds?: number[],
  { includeUnassigned = true }: { includeUnassigned?: boolean } = {},
): Promise<MatchListItem[]> {
  let leagueFilter = sql``;
  if (leagueIds && leagueIds.length > 0) {
    // Rows with no league id are kept, as the JS filter this replaced did.
    leagueFilter = includeUnassigned
      ? sql`AND (league_id IS NULL OR league_id IN (${idList(leagueIds)}))`
      : sql`AND league_id IN (${idList(leagueIds)})`;
  }

  const rows = await sql`
    SELECT
      external_id as id,
      date as "startDate",
      opponent,
      is_home,
      location,
      round,
      team_total_score,
      opponent_total_score,
      league_name,
      league_id
    FROM matches
    WHERE season_id = ${seasonId}
    ${leagueFilter}
    ORDER BY date ASC
  `;

  return rows.map((r) => {
    const isHome = Boolean(r.is_home);
    return {
      id: Number(r.id),
      startDate: r.startDate ? new Date(r.startDate as string).toISOString() : '',
      opponent: String(r.opponent || ''),
      isHome,
      location: String(r.location || ''),
      round: r.round ? Number(r.round) : 0,
      teamTotalScore: r.team_total_score != null
        ? Number(r.team_total_score)
        : null,
      opponentTotalScore: r.opponent_total_score != null
        ? Number(r.opponent_total_score)
        : null,
      leagueName: String(r.league_name || ''),
      leagueId: r.league_id ? Number(r.league_id) : undefined,
      // Map to MatchListItem compatibility
      homeName: String(isHome ? 'ŠK Železiarne Podbrezová' : r.opponent),
      awayName: String(isHome ? r.opponent : 'ŠK Železiarne Podbrezová'),
      homeId: isHome ? teamId : 0,
      awayId: isHome ? 0 : teamId,
    };
  });
}

export interface TeamBankBalance {
  total: number;
  /** Portion of `total` not yet settled. */
  unpaid: number;
  bonusesAwarded: number;
  bonusesPaid: number;
}

export interface UnpaidDebtor {
  name: string;
  amount: number;
}

/** Everyone still owing money to the bank: players' fines plus trainers' payments. */
export async function getUnpaidDebtors(
  seasonId?: number,
  leagueKey?: string,
): Promise<UnpaidDebtor[]> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const rows = await sql`
    SELECT name, SUM(amount)::numeric as amount
    FROM (
      SELECT
        COALESCE(NULLIF(CONCAT_WS(' ', pd.first_name, pd.last_name), ''), u.name) as name,
        mpr.calculated_fine as amount
      FROM match_player_results mpr
      JOIN users u ON mpr.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT sd.data->>'firstName' AS first_name, sd.data->>'lastName' AS last_name
        FROM scraped_data sd
        WHERE sd.type = 'player_detail' AND sd.external_id = u.external_player_id
        LIMIT 1
      ) pd ON true
      JOIN matches m ON mpr.match_id = m.external_id
      WHERE (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
        AND mpr.is_paid = false

      UNION ALL

      SELECT u.name as name, tp.amount as amount
      FROM trainer_payments tp
      JOIN users u ON tp.user_id = u.id
      JOIN matches m ON tp.match_id = m.external_id
      WHERE (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
        AND tp.is_paid = false
    ) debts
    GROUP BY name
    HAVING SUM(amount) > 0
    ORDER BY SUM(amount) DESC, name ASC
  `;

  return rows.map((r) => ({
    name: String(r.name || 'Unknown'),
    amount: Number(r.amount || 0),
  }));
}

export async function getTeamBankBalance(
  seasonId?: number,
  leagueKey?: string,
): Promise<TeamBankBalance> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  const result = await sql`
    WITH player_totals AS (
      SELECT
        SUM(CASE WHEN mpr.is_paid THEN mpr.calculated_fine ELSE 0 END) as paid_fines,
        SUM(mpr.calculated_fine) as all_fines,
        SUM(CASE WHEN mpr.is_bonus_paid THEN mpr.bonus_received ELSE 0 END) as paid_bonuses,
        SUM(mpr.bonus_received) as all_bonuses
      FROM match_player_results mpr
      JOIN matches m ON mpr.match_id = m.external_id
      WHERE (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    ),
    trainer_totals AS (
      SELECT
        SUM(CASE WHEN tp.is_paid THEN tp.amount ELSE 0 END) as paid_payments,
        SUM(tp.amount) as all_payments
      FROM trainer_payments tp
      JOIN matches m ON tp.match_id = m.external_id
      WHERE (m.season_id = ${targetSeasonId})
      ${leagueCondition(leagueKey)}
    )
    SELECT
      (COALESCE(p.all_fines, 0) + COALESCE(t.all_payments, 0) - COALESCE(p.all_bonuses, 0))::numeric as total,
      (COALESCE(p.all_fines, 0) + COALESCE(t.all_payments, 0) - COALESCE(p.all_bonuses, 0)
        - (COALESCE(p.paid_fines, 0) + COALESCE(t.paid_payments, 0)
           - COALESCE(p.paid_bonuses, 0)))::numeric as unpaid,
      COALESCE(p.all_bonuses, 0)::numeric as bonuses_awarded,
      COALESCE(p.paid_bonuses, 0)::numeric as bonuses_paid
    FROM player_totals p, trainer_totals t
  `;

  return {
    total: Number(result[0].total || 0),
    unpaid: Number(result[0].unpaid || 0),
    bonusesAwarded: Number(result[0].bonuses_awarded || 0),
    bonusesPaid: Number(result[0].bonuses_paid || 0),
  };
}
