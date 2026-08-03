'use server';

/* eslint-disable no-console */
import { updateSyncedData } from './cache';
import { runScrapingJob } from './scraper';

/**
 * Server action to manually trigger the scraping job.
 * This is used by the SyncButton in the UI.
 */
export async function triggerSync() {
  try {
    console.log('Manual sync triggered via Server Action');
    await runScrapingJob('manual');

    // Cached reads live for a week, so the sync has to drop them explicitly.
    updateSyncedData();

    return { success: true };
  } catch (error) {
    console.error('Manual sync failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
