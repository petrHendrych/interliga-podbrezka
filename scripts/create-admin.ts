/* eslint-disable no-console */
import * as dotenv from 'dotenv';

import sql from '../lib/db';
import { hashPassword } from '../lib/auth';

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
    const hashedPassword = await hashPassword(password);

    await sql`
      INSERT INTO users (name, email, password_hash, role, is_approved)
      VALUES ('Admin', ${email}, ${hashedPassword}, 'admin', TRUE)
      ON CONFLICT (email) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        is_approved = TRUE
    `;

    console.log('Admin user created/updated successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to create admin user:', error);
    process.exit(1);
  }
}

main();
