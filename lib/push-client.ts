/* eslint-disable no-console */
import type { PushEvent } from './push-payload';
import type { PersonalPush } from './push-digest';

/**
 * Calls the notify route from a CLI script. `lib/push.ts` imports `server-only` and reads the
 * database through Next-only modules, so a script has to reach the running app over HTTP, the
 * same way `requestSyncedDataRevalidation()` does.
 */
async function postToNotifyRoute(body: unknown, description: string): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    console.warn('NEXT_PUBLIC_APP_URL is not set; no push notification was sent.');
    return false;
  }

  const secret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/push/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`${description} failed with status ${response.status}; nobody was notified.`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`${description} request failed; nobody was notified.`, error);
    return false;
  }
}

/** Team-wide "something changed" notification. */
export async function requestPushBroadcast(event: PushEvent): Promise<boolean> {
  return postToNotifyRoute({ event }, 'Push broadcast');
}

/** Delivers the per-player money notifications a money write worked out. */
export async function requestPersonalPushes(pushes: PersonalPush[]): Promise<boolean> {
  if (pushes.length === 0) return false;

  return postToNotifyRoute({ personalPushes: pushes }, 'Personal push delivery');
}
