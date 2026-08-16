/* eslint-disable no-console */
import { NextResponse } from 'next/server';
import { claimPush, prunePushLog } from '@/lib/push-log';
import { notifyAdmins, sendPushToUsers } from '@/lib/push';
import { findStuckScrape } from '@/lib/push-digest';
import {
  getJobLock,
  getUnpaidDebtorsByUser,
  getUnsettledMatches,
  getUpcomingFixtures,
} from '@/lib/db-utils';
import {
  isReminderDay,
  nextHomeMatchDate,
  paydayDedupeKey,
  REMINDER_DAYS_BEFORE,
} from '@/lib/payday';

/** The dedupe log only has to remember long enough to stop a repeat, not forever. */
const LOG_RETENTION_DAYS = 90;

/** Long enough for the money to have been collected at the alley and entered afterwards. */
const UNSETTLED_AFTER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reminds anyone still owing the bank, two days before the next home match. */
async function remindDebtors(now: Date): Promise<number> {
  const payday = nextHomeMatchDate(await getUpcomingFixtures(now), now);
  if (!isReminderDay(payday, now)) return 0;

  const dedupeKey = paydayDedupeKey(payday as Date);
  if (!await claimPush('debtReminder', dedupeKey)) return 0;

  const debtors = await getUnpaidDebtorsByUser();
  if (debtors.length === 0) return 0;

  await sendPushToUsers(
    debtors.map(({ userId, amount }) => ({
      userId,
      params: { amount: amount.toFixed(2), days: REMINDER_DAYS_BEFORE },
    })),
    'debtReminder',
  );

  return debtors.length;
}

/**
 * Nags the admins about a played match whose fines are still open. Keyed by match and week,
 * so it comes back weekly until the money is settled rather than every single morning.
 */
async function reportUnsettledMatches(now: Date): Promise<number> {
  const playedBefore = new Date(now.getTime() - UNSETTLED_AFTER_DAYS * DAY_MS);
  const unsettled = await getUnsettledMatches(playedBefore);
  const week = Math.floor(now.getTime() / (7 * DAY_MS));

  await Promise.all(unsettled.map((match) => notifyAdmins(
    'unsettledMatch',
    { opponent: match.opponent ?? '', amount: match.unpaid.toFixed(2) },
    `${match.externalId}:${week}`,
  )));

  return unsettled.length;
}

/**
 * Daily reminder pass, triggered by Vercel Cron. Secured with the same CRON_SECRET as the
 * scraping cron. Every check inside is deduped through `push_log`, so a retry sends nothing
 * twice and a manual run is safe.
 */
export async function GET(request: Request) {
  const isLocal = process.env.NODE_ENV === 'development';
  const cronSecret = process.env.CRON_SECRET;

  if (!isLocal) {
    if (!cronSecret) {
      console.error('CRON_SECRET is not configured in environment variables');
      return new Response('Cron secret not configured', { status: 500 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const now = new Date();

  try {
    const stuck = findStuckScrape(await getJobLock('scraping_job'), now);
    if (stuck) {
      await notifyAdmins('scrapeStuck', { hours: stuck.hours }, stuck.dedupeKey);
    }

    const remindedDebtors = await remindDebtors(now);
    const unsettledMatches = await reportUnsettledMatches(now);

    const cutoff = new Date(now.getTime() - LOG_RETENTION_DAYS * DAY_MS);
    await prunePushLog(cutoff);

    return NextResponse.json({
      success: true,
      stuckScrape: stuck !== null,
      remindedDebtors,
      unsettledMatches,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Notification cron failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
