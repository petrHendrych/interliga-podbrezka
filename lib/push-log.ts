import 'server-only';

/* eslint-disable no-console */
import { and, eq, lt } from 'drizzle-orm';
import { db } from './db';
import { pushLog } from './db/schema';
import type { PushEvent } from './push-payload';

/**
 * Claims the right to send one notification, exactly once.
 *
 * Serverless functions share no memory, so two overlapping cron runs would both decide to
 * send. The unique index on `(event, dedupe_key)` is the only arbiter both can see: the
 * insert that conflicts loses and returns false.
 *
 * Fails open — if the log itself is broken the notification still goes out, because a
 * duplicate is a smaller problem than silence.
 */
export async function claimPush(event: PushEvent, dedupeKey: string): Promise<boolean> {
  try {
    const claimed = await db
      .insert(pushLog)
      .values({ event, dedupeKey })
      .onConflictDoNothing({ target: [pushLog.event, pushLog.dedupeKey] })
      .returning({ id: pushLog.id });

    return claimed.length > 0;
  } catch (error) {
    console.error('Push dedupe log failed; sending anyway:', error);
    return true;
  }
}

/** Lets a notification fire again — used when a send failed and should be retried. */
export async function releasePushClaim(event: PushEvent, dedupeKey: string): Promise<void> {
  try {
    await db
      .delete(pushLog)
      .where(and(eq(pushLog.event, event), eq(pushLog.dedupeKey, dedupeKey)));
  } catch (error) {
    console.error('Failed to release the push claim:', error);
  }
}

/** Housekeeping for the daily cron: the log only has to remember the recent past. */
export async function prunePushLog(before: Date): Promise<void> {
  try {
    await db.delete(pushLog).where(lt(pushLog.sentAt, before));
  } catch (error) {
    console.error('Failed to prune the push log:', error);
  }
}
