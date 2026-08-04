import { NextResponse } from 'next/server';
import { revalidateSyncedData } from '@/lib/cache';

/**
 * Lets the CLI scripts drop the synced-data caches. `scripts/run-sync.ts` and
 * `scripts/match-money.ts` run outside Next, where the cache helpers throw, so without
 * this the per-filter cache entries would keep serving week-old numbers.
 * Secured with the same CRON_SECRET as the scraping cron.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV !== 'development') {
    if (!cronSecret) {
      return new Response('Cron secret not configured', { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  revalidateSyncedData();

  return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
}
