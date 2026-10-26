'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { getSession } from './session';
import { type ChangelogSeenError, validateReleaseId } from './validation/changelog';

export type ChangelogSeenResult =
  | { success: true }
  | { success: false; error: ChangelogSeenError };

export async function markChangelogSeen(releaseId: number): Promise<ChangelogSeenResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'unauthorized' };

  const validated = validateReleaseId(releaseId);
  if (validated === 'invalidRelease') return { success: false, error: validated };

  try {
    // GREATEST: a dialog left open in an older tab must not bring back releases already seen.
    await db
      .update(users)
      .set({
        lastSeenReleaseId: sql`GREATEST(COALESCE(${users.lastSeenReleaseId}, 0), ${validated})`,
      })
      .where(eq(users.id, session.user.id));
    return { success: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to mark the changelog as seen:', error);
    return { success: false, error: 'genericError' };
  }
}
