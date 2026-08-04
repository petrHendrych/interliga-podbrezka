/* eslint-disable no-console */

/**
 * Calls the revalidate route from a CLI script. `lib/cache.ts` only works inside Next,
 * so a script that writes synced data has to reach the running app over HTTP or leave
 * stale per-filter cache entries behind for a week.
 */
export async function requestSyncedDataRevalidation(): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    console.warn('NEXT_PUBLIC_APP_URL is not set; cached pages keep the old numbers until the next admin sync.');
    return;
  }

  const secret = process.env.CRON_SECRET;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
    });

    if (!response.ok) {
      console.warn(`Cache revalidation failed with status ${response.status}; pages may show stale numbers.`);
    }
  } catch (error) {
    console.warn('Cache revalidation request failed; pages may show stale numbers.', error);
  }
}
