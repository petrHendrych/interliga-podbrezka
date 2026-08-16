import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendPersonalMoneyPushes, sendPushToAll } from '@/lib/push';
import { isPushEvent } from '@/lib/push-payload';
import { parsePersonalPushes } from '@/lib/push-digest';

/**
 * Broadcast endpoint for callers that run outside Next: `scripts/match-money.ts --notify`
 * authenticates with CRON_SECRET, an in-app admin with their session.
 *
 * Takes either `{ event }` for a team-wide broadcast or `{ personalPushes }` for the
 * per-player money notifications `applyMatchMoneyUpdates()` worked out but cannot deliver
 * itself, because `lib/push.ts` is unimportable outside Next.
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

  const personalPushes = parsePersonalPushes((body as { personalPushes?: unknown })
    ?.personalPushes);
  if (personalPushes !== null) {
    const result = await sendPersonalMoneyPushes(personalPushes);
    return NextResponse.json({ success: true, ...result });
  }

  const event = (body as { event?: unknown })?.event;
  if (typeof event !== 'string' || !isPushEvent(event)) {
    return new Response('Unknown push event', { status: 400 });
  }

  const result = await sendPushToAll(event);

  return NextResponse.json({ success: true, ...result });
}
