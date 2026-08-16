import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  deleteSubscription,
  parseLocale,
  parseSubscription,
  saveSubscription,
} from '@/lib/push-subscriptions';

/**
 * The service worker's `pushsubscriptionchange` handler calls this with `fetch`, so it is a
 * route handler rather than a server action. Push services rotate endpoints and the old row
 * would otherwise keep receiving pushes nobody sees.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const subscription = parseSubscription((body as { subscription?: unknown })?.subscription);
  if (!subscription) {
    return new Response('Invalid subscription', { status: 400 });
  }

  const oldEndpoint = (body as { oldEndpoint?: unknown })?.oldEndpoint;
  if (typeof oldEndpoint === 'string' && oldEndpoint !== subscription.endpoint) {
    await deleteSubscription(oldEndpoint);
  }

  await saveSubscription(
    session.user.id,
    subscription,
    parseLocale((body as { lang?: unknown })?.lang),
  );

  return NextResponse.json({ success: true });
}
