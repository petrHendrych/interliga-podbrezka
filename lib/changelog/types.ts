import type { Locale } from '../i18n/config';

export const CHANGELOG_TYPES = ['feature', 'improvement', 'fix'] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export const CHANGELOG_AUDIENCES = ['all', 'admin'] as const;
export type ChangelogAudience = (typeof CHANGELOG_AUDIENCES)[number];

export interface ChangelogEntry {
  /** Equal to the entry's file name, e.g. `2026-10-26-changelog-dialog`. */
  id: string;
  type: ChangelogType;
  audience: ChangelogAudience;
  text: Record<Locale, string>;
}

export interface ReleaseRecord {
  id: number;
  version: string;
  entryIds: string[];
  releasedAt: Date;
}

export interface ReleaseGroup {
  type: ChangelogType;
  items: string[];
}

export interface ReleaseView {
  id: number;
  version: string;
  /** ISO string, so the view crosses the server/client boundary unchanged. */
  releasedAt: string;
  groups: ReleaseGroup[];
}
