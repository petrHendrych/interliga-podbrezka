import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from './db';
import { pushSubscriptions } from './db/schema';
import { i18n, type Locale } from './i18n/config';

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function parseSubscription(value: unknown): SubscriptionInput | null {
  if (!value || typeof value !== 'object') return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== 'string' || endpoint.length === 0) return null;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (p256dh.length === 0 || auth.length === 0) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function parseLocale(value: unknown): Locale {
  return typeof value === 'string' && (i18n.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : i18n.defaultLocale;
}

/** Upserts on the endpoint, so re-subscribing a device moves it instead of duplicating it. */
export async function saveSubscription(
  userId: string,
  subscription: SubscriptionInput,
  lang: Locale,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      lang,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        lang,
      },
    });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
