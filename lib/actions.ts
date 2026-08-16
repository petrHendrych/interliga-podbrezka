'use server';

/* eslint-disable no-console */
import { updateSyncedData } from './cache';
import { runScrapingJob } from './scraper';
import { notifyAdmins, sendMatchResultsPush, sendPersonalMoneyPushes } from './push';
import { dailyDedupeKey } from './push-digest';
import { getSession } from './session';

/**
 * Server action to manually trigger the scraping job.
 * This is used by the SyncButton in the UI.
 */
export async function triggerSync() {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  try {
    console.log('Manual sync triggered via Server Action');
    const outcome = await runScrapingJob('manual');

    // Cached reads live for a week, so the sync has to drop them explicitly.
    updateSyncedData();

    // Silence when the scrape found nothing new — a sync is not news by itself.
    await sendMatchResultsPush(outcome.newResults);
    await sendPersonalMoneyPushes(outcome.personalPushes);

    return { success: true };
  } catch (error) {
    console.error('Manual sync failed:', error);
    await notifyAdmins('scrapeFailed', {}, dailyDedupeKey(new Date()));
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
