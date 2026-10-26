import { NextResponse } from 'next/server';
import { cutRelease } from '@/lib/changelog/releases';

/**
 * Cuts a changelog release and announces it. Called by `.github/workflows/deploy.yml` once
 * `vercel deploy --prod` is live, on the production domain, so `APP_VERSION` here is the
 * version the users now run. Secured with the same CRON_SECRET as the crons.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response('Cron secret not configured', { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Preview deployments share the production database, so they must never cut a release.
  if (process.env.VERCEL_ENV !== 'production') {
    return new Response('Releases are cut from production only', { status: 409 });
  }

  try {
    const result = await cutRelease(process.env.APP_VERSION ?? 'unknown');
    return NextResponse.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Cutting the release failed:', error);
    return new Response('Cutting the release failed', { status: 500 });
  }
}
