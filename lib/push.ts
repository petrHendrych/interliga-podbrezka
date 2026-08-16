import 'server-only';

/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import { eq, inArray } from 'drizzle-orm';
import webpush, { type WebPushError } from 'web-push';
import { db } from './db';
import { pushSubscriptions, users } from './db/schema';
import { getDictionary } from './i18n/dictionaries';
import { i18n, type Locale } from './i18n/config';
import { buildPushPayload, type PushEvent, type PushParams } from './push-payload';
import { claimPush, releasePushClaim } from './push-log';
import { pluralize } from './i18n/plural';
import {
  summariseNewResults,
  type NewMatchResult,
  type PersonalPush,
  type PersonalPushEvent,
} from './push-digest';
import type { Dictionary } from './i18n/types';

// Chunked so a broadcast to a large roster stays inside the Vercel function timeout.
const BATCH_SIZE = 25;

// The push service is done with a subscription for good on these two.
const GONE_STATUS_CODES = [404, 410];

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

/** One addressee of a targeted push, with the values interpolated into their own copy. */
export interface PushRecipient {
  userId: string;
  params?: PushParams;
}

/**
 * Params that depend on the reader's language — a category label, a counted noun. Resolved
 * once per locale present among the subscribers, never once per device.
 */
export type PushParamsFor = (locale: Locale, dictionary: Dictionary) => PushParams;

type ParamsInput = PushParams | PushParamsFor;

interface SubscriptionRow {
  id: number;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
}

const EMPTY_RESULT: PushResult = { sent: 0, failed: 0, removed: 0 };

const SUBSCRIPTION_COLUMNS = {
  id: pushSubscriptions.id,
  userId: pushSubscriptions.userId,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
  lang: pushSubscriptions.lang,
};

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    && process.env.VAPID_PRIVATE_KEY
    && process.env.VAPID_SUBJECT,
  );
}

function toLocale(value: string): Locale {
  return (i18n.locales as readonly string[]).includes(value)
    ? (value as Locale)
    : i18n.defaultLocale;
}

function isGone(error: unknown): boolean {
  const statusCode = (error as WebPushError)?.statusCode;
  return typeof statusCode === 'number' && GONE_STATUS_CODES.includes(statusCode);
}

async function loadDictionaries(locales: Locale[]): Promise<Map<Locale, Dictionary>> {
  const entries = await Promise.all(locales.map(async (locale) => (
    [locale, await getDictionary(locale)] as const
  )));

  return new Map(entries);
}

/** Flattens both param shapes into one lookup, resolved once per locale. */
function resolveParams(
  params: ParamsInput,
  dictionaries: Map<Locale, Dictionary>,
): Map<Locale, PushParams> {
  const resolved = new Map<Locale, PushParams>();

  dictionaries.forEach((dictionary, locale) => {
    resolved.set(
      locale,
      typeof params === 'function' ? params(locale, dictionary) : params,
    );
  });

  return resolved;
}

/**
 * The one place a notification actually leaves the server. Never throws: a push failure must
 * not fail the sync or the money write that triggered it, the same way
 * `requestSyncedDataRevalidation()` only warns.
 */
async function deliver(
  subscriptions: SubscriptionRow[],
  event: PushEvent,
  params: ParamsInput,
  paramsForSubscription: (subscription: SubscriptionRow) => PushParams = () => ({}),
): Promise<PushResult> {
  if (!isPushConfigured()) {
    console.warn('Push notifications skipped: VAPID keys are not configured.');
    return EMPTY_RESULT;
  }

  if (subscriptions.length === 0) {
    return EMPTY_RESULT;
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );

    const dictionaries = await loadDictionaries(
      [...new Set(subscriptions.map((row) => toLocale(row.lang)))],
    );
    const localeParams = resolveParams(params, dictionaries);

    const results: PromiseSettledResult<unknown>[] = [];

    for (let start = 0; start < subscriptions.length; start += BATCH_SIZE) {
      const batch = subscriptions.slice(start, start + BATCH_SIZE);
      const outcomes = await Promise.allSettled(batch.map((subscription) => {
        const locale = toLocale(subscription.lang);
        const payload = buildPushPayload(
          event,
          locale,
          (dictionaries.get(locale) as Dictionary).push,
          { ...localeParams.get(locale), ...paramsForSubscription(subscription) },
        );

        return webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
      }));
      results.push(...outcomes);
    }

    const sent = results.filter((outcome) => outcome.status === 'fulfilled').length;
    const failed = results.length - sent;
    const deadIds: number[] = [];

    results.forEach((outcome, index) => {
      if (outcome.status !== 'rejected') return;
      if (isGone(outcome.reason)) {
        deadIds.push(subscriptions[index].id);
      } else {
        console.error('Push delivery failed:', outcome.reason);
      }
    });

    if (deadIds.length > 0) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, deadIds));
    }

    console.log(`Push '${event}': sent ${sent}, failed ${failed}, removed ${deadIds.length}.`);
    return { sent, failed, removed: deadIds.length };
  } catch (error) {
    console.error('Push delivery failed:', error);
    return EMPTY_RESULT;
  }
}

/** Broadcasts one event to every subscribed device in its own language. */
export async function sendPushToAll(
  event: PushEvent,
  params: ParamsInput = {},
): Promise<PushResult> {
  if (!isPushConfigured()) {
    console.warn('Push notifications skipped: VAPID keys are not configured.');
    return EMPTY_RESULT;
  }

  try {
    const subscriptions = await db.select(SUBSCRIPTION_COLUMNS).from(pushSubscriptions);
    return await deliver(subscriptions, event, params);
  } catch (error) {
    console.error('Push broadcast failed:', error);
    return EMPTY_RESULT;
  }
}

/**
 * Sends one event to named users only, each with their own interpolated values. A user with
 * several devices gets it on all of them; a user with none is silently skipped.
 */
export async function sendPushToUsers(
  recipients: PushRecipient[],
  event: PushEvent,
): Promise<PushResult> {
  if (!isPushConfigured()) {
    console.warn('Push notifications skipped: VAPID keys are not configured.');
    return EMPTY_RESULT;
  }

  if (recipients.length === 0) {
    return EMPTY_RESULT;
  }

  try {
    const paramsByUser = new Map(recipients.map((r) => [r.userId, r.params ?? {}]));
    const subscriptions = await db
      .select(SUBSCRIPTION_COLUMNS)
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, [...paramsByUser.keys()]));

    return await deliver(
      subscriptions,
      event,
      {},
      (subscription) => paramsByUser.get(subscription.userId) ?? {},
    );
  } catch (error) {
    console.error('Targeted push failed:', error);
    return EMPTY_RESULT;
  }
}

/**
 * Sends each player their own money news. Grouped by event so one broadcast query serves
 * everyone who earned a bonus, and so a player only ever hears the single thing the digest
 * decided was worth saying.
 */
export async function sendPersonalMoneyPushes(pushes: PersonalPush[]): Promise<PushResult> {
  if (pushes.length === 0) return EMPTY_RESULT;

  const byEvent = new Map<PersonalPushEvent, PushRecipient[]>();
  pushes.forEach(({ userId, event, params }) => {
    byEvent.set(event, [...(byEvent.get(event) ?? []), { userId, params }]);
  });

  const outcomes = await Promise.all(
    [...byEvent.entries()].map(([event, recipients]) => sendPushToUsers(recipients, event)),
  );

  return outcomes.reduce((total, outcome) => ({
    sent: total.sent + outcome.sent,
    failed: total.failed + outcome.failed,
    removed: total.removed + outcome.removed,
  }), EMPTY_RESULT);
}

/**
 * Hands the claim back when delivery actually failed, so the next run retries. A send to
 * nobody is left claimed on purpose: with no subscribers there is nothing to retry, and
 * releasing would announce a stale event to whoever subscribes next.
 */
async function releaseIfUndelivered(
  event: PushEvent,
  dedupeKey: string,
  result: PushResult,
): Promise<void> {
  if (result.sent === 0 && result.failed > 0) {
    await releasePushClaim(event, dedupeKey);
  }
}

/** Addressees of every admin-only notification. Never throws — an empty list just sends nothing. */
export async function getAdminUserIds(): Promise<string[]> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'));

    return rows.map((row) => row.id);
  } catch (error) {
    console.error('Failed to load admin recipients:', error);
    return [];
  }
}

/**
 * Sends an admin-only notification. With a `dedupeKey` it fires at most once for that key,
 * so a cron that keeps failing does not notify on every run.
 */
export async function notifyAdmins(
  event: PushEvent,
  params: PushParams = {},
  dedupeKey?: string,
): Promise<PushResult> {
  if (dedupeKey && !(await claimPush(event, dedupeKey))) {
    return EMPTY_RESULT;
  }

  const admins = await getAdminUserIds();
  const result = await sendPushToUsers(
    admins.map((userId) => ({ userId, params })),
    event,
  );

  if (dedupeKey) {
    await releaseIfUndelivered(event, dedupeKey, result);
  }

  return result;
}

/**
 * Announces the results a sync just brought in. Claims each match id first, so a re-scrape of
 * the same match is silent, then sends **one** notification for the whole batch.
 */
export async function sendMatchResultsPush(results: NewMatchResult[]): Promise<PushResult> {
  if (results.length === 0) return EMPTY_RESULT;

  const claims = await Promise.all(
    results.map(async (result) => (
      await claimPush('matchResult', String(result.externalId)) ? result : null
    )),
  );
  const fresh = claims.filter((result): result is NewMatchResult => result !== null);

  const summary = summariseNewResults(fresh);
  if (!summary) return EMPTY_RESULT;

  const outcome = summary.kind === 'single'
    ? await sendPushToAll('matchResult', {
      opponent: summary.opponent,
      ourScore: summary.ourScore,
      opponentScore: summary.opponentScore,
    })
    : await sendPushToAll('matchResults', (locale, dictionary) => ({
      matches: pluralize(locale, summary.count, dictionary.push.counts.newResults),
    }));

  await Promise.all(fresh.map(
    (result) => releaseIfUndelivered('matchResult', String(result.externalId), outcome),
  ));

  return outcome;
}
