import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { appReleases, users } from '../db/schema';
import type { Locale } from '../i18n/config';
import { getAdminUserIds, sendPushToUsers } from '../push';
import { CHANGELOG_ENTRIES } from './entries';
import {
  buildReleaseViews,
  dialogReleaseViews,
  releaseAudience,
  unreleasedEntryIds,
} from './release-logic';
import type { ChangelogAudience, ReleaseRecord, ReleaseView } from './types';

export interface CutReleaseResult {
  created: boolean;
  releaseId?: number;
  version?: string;
  entryIds?: string[];
}

const RELEASE_COLUMNS = {
  id: appReleases.id,
  version: appReleases.version,
  entryIds: appReleases.entryIds,
  releasedAt: appReleases.releasedAt,
};

async function getReleases(): Promise<ReleaseRecord[]> {
  return db.select(RELEASE_COLUMNS).from(appReleases).orderBy(desc(appReleases.id));
}

async function getApprovedUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.isApproved, true));
  return rows.map((row) => row.id);
}

async function notifyRelease(audience: ChangelogAudience): Promise<void> {
  const recipients = audience === 'all' ? await getApprovedUserIds() : await getAdminUserIds();
  await sendPushToUsers(recipients.map((userId) => ({ userId })), 'appUpdated');
}

/** Stores every entry in the running code that no earlier release carried. */
export async function cutRelease(version: string): Promise<CutReleaseResult> {
  const released = await db.select({ entryIds: appReleases.entryIds }).from(appReleases);
  const releasedIds = new Set(released.flatMap((row) => row.entryIds));
  const newIds = new Set(unreleasedEntryIds(CHANGELOG_ENTRIES, releasedIds));
  const newEntries = CHANGELOG_ENTRIES.filter((entry) => newIds.has(entry.id));
  const audience = releaseAudience(newEntries);

  if (audience === null) return { created: false };

  const entryIds = newEntries.map((entry) => entry.id);
  const [release] = await db
    .insert(appReleases)
    .values({ version, entryIds, audience })
    .returning({ id: appReleases.id });

  await notifyRelease(audience);
  return {
    created: true, releaseId: release.id, version, entryIds,
  };
}

async function getReader(userId: string) {
  const [reader] = await db
    .select({
      role: users.role,
      isApproved: users.isApproved,
      createdAt: users.createdAt,
      lastSeenReleaseId: users.lastSeenReleaseId,
    })
    .from(users)
    .where(eq(users.id, userId));
  return reader;
}

export async function getDialogReleases(userId: string, lang: Locale): Promise<ReleaseView[]> {
  const reader = await getReader(userId);
  if (!reader?.isApproved) return [];

  return dialogReleaseViews(await getReleases(), CHANGELOG_ENTRIES, {
    lang,
    isAdmin: reader.role === 'admin',
    lastSeenId: reader.lastSeenReleaseId,
    userCreatedAt: reader.createdAt,
  });
}

export async function getAllReleaseViews(userId: string, lang: Locale): Promise<ReleaseView[]> {
  const reader = await getReader(userId);
  if (!reader?.isApproved) return [];

  return buildReleaseViews(await getReleases(), CHANGELOG_ENTRIES, {
    lang,
    isAdmin: reader.role === 'admin',
  });
}
