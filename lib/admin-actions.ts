'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { matchPlayerResults, trainerPayments, users } from './db/schema';
import { getSession } from './session';
import { updateSyncedData } from './cache';

const USERS_PATH = '/[lang]/admin/users';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type AdminActionError =
  | 'unauthorized'
  | 'notFound'
  | 'self'
  | 'hasResults'
  | 'invalidLink'
  | 'unknown';

export type AdminActionResult =
  | { success: true }
  | { success: false; error: AdminActionError };

export async function approveUser(userId: string) {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  try {
    await db
      .update(users)
      .set({ isApproved: true })
      .where(eq(users.id, userId));
    revalidatePath(USERS_PATH, 'page');
  } catch (error) {
    console.error('Failed to approve user:', error);
    throw new Error('Failed to approve user');
  }
}

/** Match results and trainer payments both FK to `users`, so a player with any
 *  history cannot simply be dropped — the admin has to link them instead. */
async function countLinkedRecords(userId: string): Promise<number> {
  const [results, payments] = await db.batch([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(matchPlayerResults)
      .where(eq(matchPlayerResults.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(trainerPayments)
      .where(eq(trainerPayments.userId, userId)),
  ]);

  return (results[0]?.count ?? 0) + (payments[0]?.count ?? 0);
}

export async function deleteUser(userId: string): Promise<AdminActionResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  if (session.user.id === userId) {
    return { success: false, error: 'self' };
  }

  try {
    if (await countLinkedRecords(userId) > 0) {
      return { success: false, error: 'hasResults' };
    }

    await db
      .delete(users)
      .where(eq(users.id, userId));
    revalidatePath(USERS_PATH, 'page');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete user:', error);
    return { success: false, error: 'unknown' };
  }
}

/**
 * Merges a scraped placeholder (external player ID, no e-mail) into a registered
 * account (e-mail, no external player ID): all history moves to the account, the
 * external player ID moves with it and the placeholder row is dropped. Ordering
 * matters — the placeholder has to be gone before the account can claim its
 * unique `external_player_id`.
 */
export async function linkScrapedPlayer(
  accountId: string,
  scrapedId: string,
): Promise<AdminActionResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  try {
    const [accountRows, scrapedRows] = await db.batch([
      db.select().from(users).where(eq(users.id, accountId)),
      db.select().from(users).where(eq(users.id, scrapedId)),
    ]);

    const account = accountRows[0];
    const scraped = scrapedRows[0];

    if (!account || !scraped) {
      return { success: false, error: 'notFound' };
    }

    const { externalPlayerId } = scraped;
    const isValidLink = account.email !== null
      && account.externalPlayerId === null
      && scraped.email === null
      && externalPlayerId !== null;

    if (!isValidLink) {
      return { success: false, error: 'invalidLink' };
    }

    await db.batch([
      db
        .update(matchPlayerResults)
        .set({ userId: accountId })
        .where(eq(matchPlayerResults.userId, scrapedId)),
      db
        .update(trainerPayments)
        .set({ userId: accountId })
        .where(eq(trainerPayments.userId, scrapedId)),
      db.delete(users).where(eq(users.id, scrapedId)),
      db.update(users).set({ externalPlayerId }).where(eq(users.id, accountId)),
    ]);

    // Cached player/home data is keyed by user ID, which just changed for every
    // moved result row.
    updateSyncedData();
    revalidatePath(USERS_PATH, 'page');
    return { success: true };
  } catch (error) {
    console.error('Failed to link scraped player:', error);
    return { success: false, error: 'unknown' };
  }
}
