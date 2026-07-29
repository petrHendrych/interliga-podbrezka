/* eslint-disable no-console */
import sql from './db';

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS scraped_data (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      external_id BIGINT,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(type, external_id)
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scraped_data_type_id ON scraped_data(type, external_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      is_approved BOOLEAN DEFAULT FALSE,
      external_player_id BIGINT UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('player', 'trainer', 'admin')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE;`;

  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scraped_snapshots (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      external_id BIGINT NOT NULL,
      data JSONB NOT NULL,
      scraped_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      external_id BIGINT PRIMARY KEY,
      date TIMESTAMP WITH TIME ZONE,
      opponent TEXT,
      is_home BOOLEAN,
      location TEXT,
      team_total_score INTEGER,
      opponent_total_score INTEGER,
      season_id INTEGER,
      league_name TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id INTEGER;`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS league_name TEXT;`;

  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS team_id INTEGER;`;

  await sql`
    CREATE TABLE IF NOT EXISTS match_player_results (
      match_id BIGINT REFERENCES matches(external_id),
      user_id UUID REFERENCES users(id),
      "full" INTEGER,
      clean INTEGER,
      total INTEGER,
      avg NUMERIC,
      faults INTEGER,
      special_faults_count INTEGER DEFAULT 0,
      full_faults_count INTEGER DEFAULT 0,
      second_to_last_faults_count INTEGER DEFAULT 0,
      is_worst_player BOOLEAN DEFAULT FALSE,
      is_under_600 BOOLEAN DEFAULT FALSE,
      calculated_fine NUMERIC DEFAULT 0,
      bonus_received NUMERIC DEFAULT 0,
      is_paid BOOLEAN DEFAULT FALSE,
      is_bonus_paid BOOLEAN DEFAULT FALSE,
      team_id INTEGER,
      PRIMARY KEY (match_id, user_id)
    );
  `;

  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS special_faults_count INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS full_faults_count INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS second_to_last_faults_count INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS "full" INTEGER;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS clean INTEGER;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS total INTEGER;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS avg NUMERIC;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS is_bonus_paid BOOLEAN DEFAULT FALSE;`;

  await sql`
    CREATE TABLE IF NOT EXISTS trainer_payments (
      id SERIAL PRIMARY KEY,
      match_id BIGINT REFERENCES matches(external_id),
      user_id UUID REFERENCES users(id),
      condition_type TEXT NOT NULL CHECK (condition_type IN ('score_bonus', 'zero_faults', 'elite_player')),
      amount NUMERIC NOT NULL,
      is_paid BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(match_id, user_id, condition_type)
    );
  `;

  await sql`ALTER TABLE trainer_payments DROP CONSTRAINT IF EXISTS trainer_payments_condition_type_check;`;
  await sql`ALTER TABLE trainer_payments ADD CONSTRAINT trainer_payments_condition_type_check CHECK (condition_type IN ('score_bonus', 'zero_faults', 'elite_player'));`;

  await sql`CREATE INDEX IF NOT EXISTS idx_scraped_snapshots_type_id ON scraped_snapshots(type, external_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_player_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_match_player_results_user_id ON match_player_results(user_id);`;

  await sql`DROP VIEW IF EXISTS view_user_balances;`;

  await sql`
    CREATE OR REPLACE VIEW view_user_balances AS
    WITH player_stats AS (
      SELECT 
        mpr.user_id,
        m.season_id,
        SUM(mpr.calculated_fine) as total_fines,
        SUM(mpr.bonus_received) as total_bonuses,
        SUM(CASE WHEN mpr.is_paid THEN mpr.calculated_fine ELSE 0 END) as paid_fines,
        SUM(CASE WHEN mpr.is_bonus_paid THEN mpr.bonus_received ELSE 0 END) as paid_bonuses,
        COUNT(mpr.match_id) as matches_count,
        AVG(mpr.total) as avg_score,
        MAX(mpr.total) as max_score,
        SUM(mpr.faults) as total_faults
      FROM match_player_results mpr
      LEFT JOIN matches m ON mpr.match_id = m.external_id
      GROUP BY mpr.user_id, m.season_id
    ),
    trainer_stats AS (
      SELECT
        tp.user_id,
        m.season_id,
        SUM(tp.amount) as total_trainer_payments,
        SUM(CASE WHEN tp.is_paid THEN tp.amount ELSE 0 END) as paid_trainer_payments
      FROM trainer_payments tp
      LEFT JOIN matches m ON tp.match_id = m.external_id
      GROUP BY tp.user_id, m.season_id
    ),
    user_seasons AS (
      SELECT user_id, season_id FROM player_stats
      UNION
      SELECT user_id, season_id FROM trainer_stats
    )
    SELECT
      u.id as user_id,
      u.name,
      u.role,
      u.external_player_id,
      us.season_id,
      COALESCE(ps.total_fines, 0) + COALESCE(ts.total_trainer_payments, 0) as total_due,
      COALESCE(ps.total_bonuses, 0) as total_bonuses,
      COALESCE(ps.paid_bonuses, 0) as paid_bonuses,
      COALESCE(ps.paid_fines, 0) + COALESCE(ts.paid_trainer_payments, 0) as total_paid,
      (COALESCE(ps.total_fines, 0) + COALESCE(ts.total_trainer_payments, 0)) 
      - (COALESCE(ps.paid_fines, 0) + COALESCE(ts.paid_trainer_payments, 0)) as balance,
      COALESCE(ps.matches_count, 0) as matches_count,
      COALESCE(ps.avg_score, 0) as avg_score,
      COALESCE(ps.max_score, 0) as max_score,
      COALESCE(ps.total_faults, 0) as total_faults
    FROM users u
    LEFT JOIN user_seasons us ON u.id = us.user_id
    LEFT JOIN player_stats ps ON us.user_id = ps.user_id AND us.season_id IS NOT DISTINCT FROM ps.season_id
    LEFT JOIN trainer_stats ts ON us.user_id = ts.user_id AND us.season_id IS NOT DISTINCT FROM ts.season_id;
  `;
}

export async function upsertScrapedData(type: string, externalId: number, data: unknown) {
  if (data === undefined) {
    console.error(`Attempted to upsert undefined data for ${type}:${externalId}`);
    return;
  }

  try {
    const jsonString = JSON.stringify(data);
    await sql`
      INSERT INTO scraped_data (type, external_id, data, updated_at)
      VALUES (${type}, ${externalId}, ${jsonString}::jsonb, NOW())
      ON CONFLICT (type, external_id)
      DO UPDATE SET 
        data = EXCLUDED.data, 
        updated_at = NOW();
    `;
  } catch (error) {
    console.error(`Failed to upsert ${type} for ID ${externalId}:`, error);
    throw error;
  }
}

export async function saveSnapshot(type: string, externalId: number, data: unknown) {
  if (data === undefined) {
    console.error(`Attempted to save undefined snapshot for ${type}:${externalId}`);
    return;
  }

  try {
    const jsonString = JSON.stringify(data);
    await sql`
      INSERT INTO scraped_snapshots (type, external_id, data, scraped_at)
      VALUES (${type}, ${externalId}, ${jsonString}::jsonb, NOW());
    `;
  } catch (error) {
    console.error(`Failed to save snapshot for ${type} ID ${externalId}:`, error);
    throw error;
  }
}

export async function getScrapedData<T>(type: string, externalId: number): Promise<T | null> {
  try {
    const results = await sql`
      SELECT data FROM scraped_data 
      WHERE type = ${type} AND external_id = ${externalId}
      LIMIT 1;
    `;

    if (results.length === 0) return null;
    return results[0].data as T;
  } catch (error) {
    // If the table doesn't exist, ensure schema and try again
    if (error instanceof Error && error.message.includes('does not exist')) {
      await ensureSchema();
      return getScrapedData(type, externalId);
    }
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

export async function getTrainersWithStats(): Promise<DBTrainerStats[]> {
  const trainers = await sql`
    SELECT 
      u.id::text, 
      u.name,
      COUNT(CASE WHEN tp.condition_type = 'score_bonus' AND tp.amount = 10 THEN 1 END)::int as count3800,
      COUNT(CASE WHEN tp.condition_type = 'score_bonus' AND tp.amount = 15 THEN 1 END)::int as count3900,
      COUNT(CASE WHEN tp.condition_type = 'zero_faults' THEN 1 END)::int as "zeroMisses",
      (COALESCE(SUM(tp.amount), 0)::text || ' €') as "totalPaid"
    FROM users u
    LEFT JOIN trainer_payments tp ON u.id = tp.user_id
    WHERE u.role = 'trainer' AND u.is_approved = true
    GROUP BY u.id, u.name
  ` as unknown as DBTrainerStats[];
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
  totalDue: number;
  totalBonuses: number;
  totalPaid: number;
  balance: number;
  matchesCount: number;
  avgScore: number;
  maxScore: number;
  totalFaults: number;
}

export async function getPlayerBalances(): Promise<PlayerSeasonBalance[]> {
  // Get the latest season ID
  const latestSeasonResult = await sql`
    SELECT season_id FROM matches WHERE season_id IS NOT NULL ORDER BY date DESC LIMIT 1
  `;
  const latestSeasonId = latestSeasonResult.length > 0 ? latestSeasonResult[0].season_id : null;

  const rows = await sql`
    SELECT 
      external_player_id,
      name,
      user_id::text,
      SUM(total_due)::text as total_due,
      SUM(total_bonuses)::text as total_bonuses,
      SUM(total_paid)::text as total_paid,
      SUM(balance)::text as balance,
      SUM(matches_count)::text as matches_count,
      AVG(avg_score)::numeric as avg_score,
      MAX(max_score)::int as max_score,
      SUM(total_faults)::int as total_faults
    FROM view_user_balances
    WHERE role = 'player'
    AND (season_id IS NOT DISTINCT FROM ${latestSeasonId}::integer OR season_id IS NULL)
    GROUP BY external_player_id, name, user_id
  `;
  return rows.map((r) => ({
    externalPlayerId: r.external_player_id ? Number(r.external_player_id) : null,
    name: String(r.name || 'Unknown'),
    userId: String(r.user_id),
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
): Promise<PlayerBalance> {
  // Get the latest season ID
  const latestSeasonResult = await sql`
    SELECT season_id FROM matches WHERE season_id IS NOT NULL ORDER BY date DESC LIMIT 1
  `;
  const latestSeasonId = latestSeasonResult.length > 0 ? latestSeasonResult[0].season_id : null;

  const rows = await sql`
    SELECT 
      SUM(total_due)::text as total_due,
      SUM(total_bonuses)::text as total_bonuses,
      SUM(paid_bonuses)::text as paid_bonuses,
      SUM(total_paid)::text as total_paid,
      SUM(balance)::text as balance
    FROM view_user_balances
    WHERE external_player_id = ${externalPlayerId}
    AND (season_id IS NOT DISTINCT FROM ${latestSeasonId}::integer OR season_id IS NULL)
    GROUP BY external_player_id
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

export async function getPlayerMatchResultsByExternalId(
  externalPlayerId: number,
): Promise<PlayerMatchResult[]> {
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

export async function getTeamBankBalance(): Promise<{ actual: number; total: number }> {
  // Get the latest season ID to filter the bank balance
  const latestSeasonResult = await sql`
    SELECT season_id 
    FROM matches 
    WHERE season_id IS NOT NULL 
    ORDER BY date DESC 
    LIMIT 1
  `;
  const latestSeasonId = latestSeasonResult.length > 0 ? latestSeasonResult[0].season_id : null;

  const result = await sql`
    WITH player_totals AS (
      SELECT 
        SUM(CASE WHEN mpr.is_paid THEN mpr.calculated_fine ELSE 0 END) as paid_fines,
        SUM(mpr.calculated_fine) as all_fines,
        SUM(CASE WHEN mpr.is_bonus_paid THEN mpr.bonus_received ELSE 0 END) as paid_bonuses,
        SUM(mpr.bonus_received) as all_bonuses
      FROM match_player_results mpr
      JOIN matches m ON mpr.match_id = m.external_id
      WHERE (m.season_id IS NOT DISTINCT FROM ${latestSeasonId}::integer OR m.season_id IS NULL)
    ),
    trainer_totals AS (
      SELECT
        SUM(CASE WHEN tp.is_paid THEN tp.amount ELSE 0 END) as paid_payments,
        SUM(tp.amount) as all_payments
      FROM trainer_payments tp
      JOIN matches m ON tp.match_id = m.external_id
      WHERE (m.season_id IS NOT DISTINCT FROM ${latestSeasonId}::integer OR m.season_id IS NULL)
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
