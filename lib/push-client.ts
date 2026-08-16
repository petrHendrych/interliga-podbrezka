/* eslint-disable no-console */
import type { PushEvent } from './push-payload';

/**
 * Calls the broadcast route from a CLI script. `lib/push.ts` reads the database through
 * Next-only modules, so a script has to reach the running app over HTTP, the same way
 * `requestSyncedDataRevalidation()` does.
 */
export async function requestPushBroadcast(event: PushEvent): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    console.warn('NEXT_PUBLIC_APP_URL is not set; no push notification was sent.');
    return;
  }

  const secret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/push/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ event }),
    });

    if (!response.ok) {
      console.warn(`Push broadcast failed with status ${response.status}; nobody was notified.`);
    }
  } catch (error) {
    console.warn('Push broadcast request failed; nobody was notified.', error);
  }
}
