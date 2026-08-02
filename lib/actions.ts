'use server';

/* eslint-disable no-console */
import { revalidatePath } from 'next/cache';
import { runScrapingJob } from './scraper';

/**
 * Server action to manually trigger the scraping job.
 * This is used by the SyncButton in the UI.
 */
export async function triggerSync() {
  try {
    console.log('Manual sync triggered via Server Action');
    await runScrapingJob('manual');

    // Revalidate the home page to show updated data
    revalidatePath('/');

    return { success: true };
  } catch (error) {
    console.error('Manual sync failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
