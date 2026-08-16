import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendPushToAll } from '@/lib/push';
import { isPushEvent } from '@/lib/push-payload';

/**
 * Broadcast endpoint for callers that run outside Next: `scripts/match-money.ts --notify`
 * authenticates with CRON_SECRET, an in-app admin with their session.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const hasSecret = Boolean(cronSecret)
    && request.headers.get('authorization') === `Bearer ${cronSecret}`;

  if (!hasSecret) {
    const session = await getSession();
    if (session?.user.role !== 'admin') {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  const event = (body as { event?: unknown })?.event;
  if (typeof event !== 'string' || !isPushEvent(event)) {
    return new Response('Unknown push event', { status: 400 });
  }

  const result = await sendPushToAll(event);

  return NextResponse.json({ success: true, ...result });
}
