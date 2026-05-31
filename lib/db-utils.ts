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
  await sql`
    INSERT INTO scraped_data (type, external_id, data, updated_at)
    VALUES (${type}, ${externalId}, ${data as Record<string, unknown>}, NOW())
    ON CONFLICT (type, external_id)
    DO UPDATE SET 
      data = EXCLUDED.data, 
      updated_at = NOW();
  `;
}

export async function getScrapedData<T>(type: string, externalId: number): Promise<T | null> {
  const results = await sql`
    SELECT data FROM scraped_data 
    WHERE type = ${type} AND external_id = ${externalId}
    LIMIT 1;
  `;

  if (results.length === 0) return null;
  return results[0].data as T;
}
