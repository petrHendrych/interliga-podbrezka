/* eslint-disable no-console */
import * as dotenv from 'dotenv';

import { ensureSchema } from '../lib/db-utils';

dotenv.config({ path: '.env.local' });

async function main() {
  console.log('Ensuring schema...');
  try {
    await ensureSchema();
    console.log('Schema updated successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to update schema:', error);
    process.exit(1);
  }
}

main();
