/* eslint-disable no-console */
import { NextResponse } from 'next/server';
import { runScrapingJob } from '@/lib/scraper';

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

  try {
    // Run the scraping job
    await runScrapingJob('cron');

    return NextResponse.json({
      success: true,
      message: 'Scraping job completed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during cron scraping job:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
