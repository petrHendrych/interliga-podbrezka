/* eslint-disable no-console */
import { NextResponse } from 'next/server';
import { runScrapingJob } from '@/lib/scraper';
import { revalidateSyncedData } from '@/lib/cache';
import { notifyAdmins, sendMatchResultsPush, sendPersonalMoneyPushes } from '@/lib/push';
import { dailyDedupeKey } from '@/lib/push-digest';

/**
 * API Route to trigger the scraping job via Vercel Cron.
 * Secured using the CRON_SECRET environment variable.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');

  // Basic security check to ensure only authorized callers can trigger this
  const isLocal = process.env.NODE_ENV === 'development';
  const cronSecret = process.env.CRON_SECRET;

  if (!isLocal) {
    if (!cronSecret) {
      console.error('CRON_SECRET is not configured in environment variables');
      return new Response('Cron secret not configured', { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const startDate = new Date('2026-09-13T00:00:00Z');
  const now = new Date();

  if (now < startDate) {
    console.log(`Periodic cron scraping paused until ${startDate.toISOString()}. Current date: ${now.toISOString()}`);
    return NextResponse.json({
      success: true,
      message: `Scraping paused until ${startDate.toISOString().split('T')[0]}`,
      timestamp: now.toISOString(),
    });
  }

  try {
    // Run the scraping job
    const outcome = await runScrapingJob('cron');

    // Cached reads live for a week, so the sync has to drop them explicitly.
    revalidateSyncedData();

    // Silence when the scrape found nothing new — which is most weeks.
    await sendMatchResultsPush(outcome.newResults);
    await sendPersonalMoneyPushes(outcome.personalPushes);

    return NextResponse.json({
      success: true,
      message: 'Scraping job completed successfully',
      newResults: outcome.newResults.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during cron scraping job:', error);

    // The 500 below goes to Vercel's cron log, which nobody reads. Once a day is enough.
    await notifyAdmins('scrapeFailed', {}, dailyDedupeKey(new Date()));

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
