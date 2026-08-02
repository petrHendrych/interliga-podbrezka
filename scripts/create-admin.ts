/* eslint-disable no-console */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ADMIN_EMAIL or ADMIN_PASSWORD not defined in .env.local');
    process.exit(1);
  }

  console.log(`Creating/Updating admin user: ${email}`);

  try {
    const { db } = await import('../lib/db');
    const { users } = await import('../lib/db/schema');
    const { hashPassword } = await import('../lib/auth');

    const hashedPassword = await hashPassword(password);

    await db
      .insert(users)
      .values({
        name: 'Admin',
        email,
        passwordHash: hashedPassword,
        role: 'admin',
        isApproved: true,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: hashedPassword,
          role: 'admin',
          isApproved: true,
        },
      });

    console.log('Admin user created/updated successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exit(1);
  }
}

main();
