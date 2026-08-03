import { revalidateTag, updateTag } from 'next/cache';

/** Freshness comes from the invalidators below, not from this expiring. */
export const SYNCED_DATA_REVALIDATE_SECONDS = 60 * 60 * 24 * 7;

export const SYNCED_DATA_TAGS = [
  'home-data',
  'player-balance',
  'player-match-results',
  'player-detail',
];

/**
 * For the weekly cron: stale-while-revalidate, refreshed on next visit.
 * Route handlers only. Kept out of `syncData` because `scripts/run-sync.ts`
 * runs that outside Next, where these throw.
 */
export function revalidateSyncedData() {
  SYNCED_DATA_TAGS.forEach((tag) => revalidateTag(tag, 'max'));
}

/** For the Sync button: expires immediately so the admin sees fresh numbers. */
export function updateSyncedData() {
  SYNCED_DATA_TAGS.forEach((tag) => updateTag(tag));
}
