import type { Locale } from '../i18n/config';
import {
  CHANGELOG_TYPES,
  type ChangelogAudience,
  type ChangelogEntry,
  type ReleaseRecord,
  type ReleaseView,
} from './types';

export const CHANGELOG_DIALOG_LIMIT = 5;

export function unreleasedEntryIds(
  entries: ChangelogEntry[],
  releasedIds: ReadonlySet<string>,
): string[] {
  return entries.map((entry) => entry.id).filter((id) => !releasedIds.has(id));
}

/** Who hears about a release: players only when at least one item is for them. */
export function releaseAudience(entries: ChangelogEntry[]): ChangelogAudience | null {
  if (entries.length === 0) return null;
  return entries.some((entry) => entry.audience === 'all') ? 'all' : 'admin';
}

/**
 * Ids the running code no longer knows (after a rollback) are dropped, as are admin items for
 * everyone else; a release left with nothing to show disappears entirely.
 */
export function buildReleaseViews(
  releases: ReleaseRecord[],
  entries: ChangelogEntry[],
  { lang, isAdmin }: { lang: Locale; isAdmin: boolean },
): ReleaseView[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  return releases.flatMap((release) => {
    const visible = release.entryIds
      .map((id) => byId.get(id))
      .filter((entry): entry is ChangelogEntry => entry !== undefined)
      .filter((entry) => isAdmin || entry.audience === 'all');

    const groups = CHANGELOG_TYPES
      .map((type) => ({
        type,
        items: visible.filter((entry) => entry.type === type).map((entry) => entry.text[lang]),
      }))
      .filter((group) => group.items.length > 0);

    if (groups.length === 0) return [];
    return [{
      id: release.id,
      version: release.version,
      releasedAt: release.releasedAt.toISOString(),
      groups,
    }];
  });
}

/** A user who registered after a release never sees it: it was news before their time. */
export function unseenReleases(
  releases: ReleaseRecord[],
  { lastSeenId, userCreatedAt }: { lastSeenId: number | null; userCreatedAt: Date | null },
): ReleaseRecord[] {
  return releases
    .filter((release) => release.id > (lastSeenId ?? 0))
    .filter((release) => userCreatedAt === null || release.releasedAt > userCreatedAt)
    .sort((a, b) => b.id - a.id);
}

export interface ChangelogReader {
  lang: Locale;
  isAdmin: boolean;
  lastSeenId: number | null;
  userCreatedAt: Date | null;
}

/** Capped after filtering, so releases a player cannot see never take one of the slots. */
export function dialogReleaseViews(
  releases: ReleaseRecord[],
  entries: ChangelogEntry[],
  reader: ChangelogReader,
): ReleaseView[] {
  return buildReleaseViews(unseenReleases(releases, reader), entries, reader)
    .slice(0, CHANGELOG_DIALOG_LIMIT);
}
