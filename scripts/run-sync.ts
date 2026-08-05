/* eslint-disable no-console */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  console.log('Starting data sync from scraped_data...');
  try {
    const { syncData } = await import('../lib/sync');
    await syncData();
    const { requestSyncedDataRevalidation } = await import('../lib/revalidate-client');
    await requestSyncedDataRevalidation();
    console.log('Sync completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

main();
