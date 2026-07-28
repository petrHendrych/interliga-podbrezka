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
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id INTEGER;`;

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
      PRIMARY KEY (match_id, user_id)
    );
  `;

  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS special_faults_count INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS full_faults_count INTEGER DEFAULT 0;`;
  await sql`ALTER TABLE match_player_results ADD COLUMN IF NOT EXISTS second_to_last_faults_count INTEGER DEFAULT 0;`;

  await sql`
    CREATE TABLE IF NOT EXISTS trainer_payments (
      id SERIAL PRIMARY KEY,
      match_id BIGINT REFERENCES matches(external_id),
      user_id UUID REFERENCES users(id),
      condition_type TEXT NOT NULL CHECK (condition_type IN ('score_bonus', 'zero_faults')),
      amount NUMERIC NOT NULL,
      is_paid BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(match_id, user_id, condition_type)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_scraped_snapshots_type_id ON scraped_snapshots(type, external_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_player_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_match_player_results_user_id ON match_player_results(user_id);`;

  await sql`
    CREATE OR REPLACE VIEW view_user_balances AS
    WITH player_stats AS (
      SELECT 
        mpr.user_id,
        m.season_id,
        SUM(mpr.calculated_fine) as total_fines,
        SUM(mpr.bonus_received) as total_bonuses,
        SUM(CASE WHEN mpr.is_paid THEN mpr.calculated_fine ELSE 0 END) as paid_fines
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
      COALESCE(ps.paid_fines, 0) + COALESCE(ts.paid_trainer_payments, 0) as total_paid,
      (COALESCE(ps.total_fines, 0) + COALESCE(ts.total_trainer_payments, 0)) 
      - COALESCE(ps.total_bonuses, 0) 
      - (COALESCE(ps.paid_fines, 0) + COALESCE(ts.paid_trainer_payments, 0)) as balance
    FROM users u
    LEFT JOIN user_seasons us ON u.id = us.user_id
    LEFT JOIN player_stats ps ON us.user_id = ps.user_id AND (us.season_id = ps.season_id OR (us.season_id IS NULL AND ps.season_id IS NULL))
    LEFT JOIN trainer_stats ts ON us.user_id = ts.user_id AND (us.season_id = ts.season_id OR (us.season_id IS NULL AND ts.season_id IS NULL));
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

export async function getTrainersWithStats() {
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
  ` as unknown as Array<{
    id: string;
    name: string;
    count3800: number;
    count3900: number;
    zeroMisses: number;
    totalPaid: string;
  }>;
  return trainers;
}
