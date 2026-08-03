/* eslint-disable no-console */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const { db, sql } = await import('../lib/db');
  const { users } = await import('../lib/db/schema');
  const { syncData } = await import('../lib/sync');
  const { eq, and } = await import('drizzle-orm');

  console.log('Ensuring unique index on trainer_payments...');
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_payments_match_user_condition 
    ON trainer_payments (match_id, user_id, condition_type);
  `;

  const trainerName = 'Miloš Ponajavić';

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.role, 'trainer'), eq(users.name, trainerName)));

  if (existing.length > 0) {
    console.log(`Trainer "${trainerName}" already exists with ID: ${existing[0].id}`);
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        name: trainerName,
        role: 'trainer',
        isApproved: true,
      })
      .returning();
    console.log(`Successfully added trainer "${trainerName}" with ID: ${inserted.id}`);
  }

  console.log('Running syncData to compute trainer payments...');
  await syncData();
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error adding trainer:', err);
  process.exit(1);
});
