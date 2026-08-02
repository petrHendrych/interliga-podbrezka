/* eslint-disable no-console */
import { unstable_cache } from 'next/cache';
import { eq, and, inArray } from 'drizzle-orm';
import { db, sql } from './db';
import { scrapedSnapshots, scrapedData, systemStatus } from './db/schema';
import { DEFAULT_SEASON_ID } from './season-config';
import { MatchListItem } from './api';

export async function purgeScrapedSnapshots() {
  try {
    await db.delete(scrapedSnapshots);
    console.log('Successfully purged scraped_snapshots table.');
  } catch (error) {
    console.error('Failed to purge scraped_snapshots table:', error);
  }
}

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

/**
 * @deprecated Snapshot history is deprecated to reduce DB transfer.
 * Only single latest scrape in `scraped_data` is stored.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveSnapshot(type: string, externalId: number, data: unknown) {
  /* Deprecated no-op */
}

export async function getScrapedData<T>(
  type: string,
  externalId: number,
  fields?: string[],
): Promise<T | null> {
  try {
    const results = await db
      .select({ data: scrapedData.data })
      .from(scrapedData)
      .where(and(eq(scrapedData.type, type), eq(scrapedData.externalId, externalId)))
      .limit(1);

    if (results.length === 0) return null;
    const rawData = results[0].data as Record<string, unknown>;

    if (fields && fields.length > 0 && typeof rawData === 'object' && rawData !== null) {
      const filtered: Record<string, unknown> = {};
      fields.forEach((f) => {
        if (f in rawData) {
          filtered[f] = rawData[f];
        }
      });
      return filtered as T;
    }

    return rawData as T;
  } catch (error) {
    console.error(`Failed to get scraped data for ${type}:${externalId}`, error);
    throw error;
  }
}

export async function getScrapedDataBatch<T>(
  type: string,
  externalIds: number[],
  fields?: string[],
): Promise<Map<number, T>> {
  if (externalIds.length === 0) return new Map();

  try {
    const results = await db
      .select({ externalId: scrapedData.externalId, data: scrapedData.data })
      .from(scrapedData)
      .where(and(eq(scrapedData.type, type), inArray(scrapedData.externalId, externalIds)));

    const map = new Map<number, T>();
    results.forEach((row) => {
      if (row.externalId === null) return;
      const rawData = row.data as Record<string, unknown>;
      if (fields && fields.length > 0 && typeof rawData === 'object' && rawData !== null) {
        const filtered: Record<string, unknown> = {};
        fields.forEach((f) => {
          if (f in rawData) {
            filtered[f] = rawData[f];
          }
        });
        map.set(Number(row.externalId), filtered as T);
      } else {
        map.set(Number(row.externalId), rawData as T);
      }
    });
    return map;
  } catch (error) {
    console.error(`Failed to get scraped data batch for ${type}`, error);
    throw error;
  }
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

  let leagueCondition = sql``;
  if (leagueKey === 'interliga') {
    leagueCondition = sql`AND (m.league_id = 368 OR m.league_id = 354 OR m.league_name ILIKE '%interliga%')`;
  } else if (leagueKey === 'pohar') {
    leagueCondition = sql`AND (m.league_id = 364 OR m.league_id = 366 OR m.league_name ILIKE '%pohár%' OR m.league_name ILIKE '%pohar%' OR m.league_name ILIKE '%finále%' OR m.league_name ILIKE '%finale%')`;
  }

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
      ${leagueCondition}
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
  fullFaultsCount: number;
  secondToLastFaultsCount: number;
  specialFaultsCount: number;
  faultlessStreak: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
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

  let leagueCondition = sql``;
  if (leagueKey === 'interliga') {
    leagueCondition = sql`AND (m.league_id = 368 OR m.league_id = 354 OR m.league_name ILIKE '%interliga%')`;
  } else if (leagueKey === 'pohar') {
    leagueCondition = sql`AND (m.league_id = 364 OR m.league_id = 366 OR m.league_name ILIKE '%pohár%' OR m.league_name ILIKE '%pohar%' OR m.league_name ILIKE '%finále%' OR m.league_name ILIKE '%finale%')`;
  }

  const rows = await sql`
    SELECT 
      u.external_player_id,
      u.name,
      u.id::text as user_id,
      sd.data->>'firstName' as first_name,
      sd.data->>'lastName' as last_name,
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
    LEFT JOIN scraped_data sd ON sd.type = 'player_detail' AND sd.external_id = u.external_player_id
    LEFT JOIN match_player_results mpr ON u.id = mpr.user_id
    LEFT JOIN matches m ON mpr.match_id = m.external_id 
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition}
    WHERE u.role = 'player' AND u.is_approved = true
    GROUP BY u.external_player_id, u.name, u.id, sd.data
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

  let leagueCondition = sql``;
  if (leagueKey === 'interliga') {
    leagueCondition = sql`AND (m.league_id = 368 OR m.league_id = 354 OR m.league_name ILIKE '%interliga%')`;
  } else if (leagueKey === 'pohar') {
    leagueCondition = sql`AND (m.league_id = 364 OR m.league_id = 366 OR m.league_name ILIKE '%pohár%' OR m.league_name ILIKE '%pohar%' OR m.league_name ILIKE '%finále%' OR m.league_name ILIKE '%finale%')`;
  }

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
      ${leagueCondition}
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
  { revalidate: 60, tags: ['player-balance'] },
);

export async function getPlayerMatchResultsByExternalId(
  externalPlayerId: number,
  seasonId?: number,
  leagueKey?: string,
): Promise<PlayerMatchResult[]> {
  const targetSeasonId = seasonId ?? DEFAULT_SEASON_ID;

  let leagueCondition = sql``;
  if (leagueKey === 'interliga') {
    leagueCondition = sql`AND (m.league_id = 368 OR m.league_id = 354 OR m.league_name ILIKE '%interliga%')`;
  } else if (leagueKey === 'pohar') {
    leagueCondition = sql`AND (m.league_id = 364 OR m.league_id = 366 OR m.league_name ILIKE '%pohár%' OR m.league_name ILIKE '%pohar%' OR m.league_name ILIKE '%finále%' OR m.league_name ILIKE '%finale%')`;
  }

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
      COALESCE(mpr.full_faults_count, 0) as full_faults_count,
      COALESCE(mpr.second_to_last_faults_count, 0) as second_to_last_faults_count,
      COALESCE(mpr.special_faults_count, 0) as special_faults_count,
      m.date,
      m.opponent,
      m.is_home,
      m.league_name
    FROM match_player_results mpr
    JOIN users u ON mpr.user_id = u.id
    JOIN matches m ON mpr.match_id = m.external_id
    WHERE u.external_player_id = ${externalPlayerId}
      AND (m.season_id = ${targetSeasonId})
      ${leagueCondition}
    ORDER BY m.date DESC
  `;

  // Calculate faultless streak chronologically
  const chronologicalRows = [...rows].sort((a, b) => {
    const timeA = a.date ? new Date(a.date as string | Date).getTime() : 0;
    const timeB = b.date ? new Date(b.date as string | Date).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return Number(a.match_id) - Number(b.match_id);
  });

  const streakMap = new Map<number, number>();
  let currentStreak = 0;
  chronologicalRows.forEach((r) => {
    const faults = Number(r.faults || 0);
    if (faults === 0) {
      currentStreak += 1;
    } else {
      currentStreak = 0;
    }
    streakMap.set(Number(r.match_id), currentStreak);
  });

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
      fullFaultsCount: Number(r.full_faults_count || 0),
      secondToLastFaultsCount: Number(r.second_to_last_faults_count || 0),
      specialFaultsCount: Number(r.special_faults_count || 0),
      faultlessStreak: streakMap.get(matchId) || 0,
      date: r.date ? new Date(r.date as string | Date).toISOString() : null,
      opponent: (r.opponent as string) || null,
      isHome: r.is_home === null ? null : Boolean(r.is_home),
      leagueName: (r.league_name as string) || null,
    };
  });
}

export const getCachedPlayerMatchResults = unstable_cache(
  async (playerId: number, seasonId: number, leagueKey: string) => (
    getPlayerMatchResultsByExternalId(playerId, seasonId, leagueKey)
  ),
  ['player-match-results'],
  { revalidate: 60, tags: ['player-match-results'] },
);

export async function getMatchesByTeamId(
  teamId: number,
  seasonId: number,
): Promise<MatchListItem[]> {
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

export async function getTeamBankBalance(
  seasonId?: number,
): Promise<{ actual: number; total: number }> {
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
    ),
    trainer_totals AS (
      SELECT
        SUM(CASE WHEN tp.is_paid THEN tp.amount ELSE 0 END) as paid_payments,
        SUM(tp.amount) as all_payments
      FROM trainer_payments tp
      JOIN matches m ON tp.match_id = m.external_id
      WHERE (m.season_id = ${targetSeasonId})
    )
    SELECT 
      (COALESCE(p.paid_fines, 0) + COALESCE(t.paid_payments, 0) - COALESCE(p.paid_bonuses, 0))::numeric as actual,
      (COALESCE(p.all_fines, 0) + COALESCE(t.all_payments, 0) - COALESCE(p.all_bonuses, 0))::numeric as total
    FROM player_totals p, trainer_totals t
  `;

  return {
    actual: Number(result[0].actual || 0),
    total: Number(result[0].total || 0),
  };
}
