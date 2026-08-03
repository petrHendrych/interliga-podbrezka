import { revalidateTag, updateTag } from 'next/cache';

/**
 * League data only changes when the weekly sync runs, so cached reads live for a
 * week rather than the minute they used to. Freshness comes from
 * `revalidateSyncedData()` below, not from the TTL expiring.
 */
export const SYNCED_DATA_REVALIDATE_SECONDS = 60 * 60 * 24 * 7;

export const SYNCED_DATA_TAGS = [
  'home-data',
  'player-balance',
  'player-match-results',
  'player-detail',
];

/**
 * Marks every sync-backed cache entry stale, for the weekly cron. Uses
 * stale-while-revalidate: nobody is waiting on the response, and the refresh
 * happens on the next visit rather than all at once.
 *
 * Route-handler only. Neither this nor `updateSyncedData` belongs in `syncData`
 * itself, because `scripts/run-sync.ts` runs that outside of Next entirely.
 */
export function revalidateSyncedData() {
  SYNCED_DATA_TAGS.forEach((tag) => revalidateTag(tag, 'max'));
}

/**
 * Expires the same entries immediately, for the manual Sync button. `updateTag`
 * gives read-your-own-writes so the admin sees fresh numbers on the next render
 * instead of one more stale page. Server-Action only — it throws elsewhere.
 */
export function updateSyncedData() {
  SYNCED_DATA_TAGS.forEach((tag) => updateTag(tag));
}
