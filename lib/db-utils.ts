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
