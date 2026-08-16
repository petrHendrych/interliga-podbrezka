'use server';

/* eslint-disable no-console */

import { getSession } from './session';
import { sendPushToAll } from './push';
import {
  deleteSubscription,
  parseLocale,
  parseSubscription,
  saveSubscription,
} from './push-subscriptions';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type PushActionError = 'unauthorized' | 'saveFailed' | 'sendFailed';

export type PushActionResult =
  | { success: true }
  | { success: false; error: PushActionError };

export async function savePushSubscription(
  subscription: unknown,
  lang: unknown,
): Promise<PushActionResult> {
  const session = await getSession();
  if (!session?.user.id) {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = parseSubscription(subscription);
  if (!parsed) {
    return { success: false, error: 'saveFailed' };
  }

  try {
    await saveSubscription(session.user.id, parsed, parseLocale(lang));
    return { success: true };
  } catch (error) {
    console.error('Failed to save push subscription:', error);
    return { success: false, error: 'saveFailed' };
  }
}

export async function removePushSubscription(endpoint: string): Promise<PushActionResult> {
  const session = await getSession();
  if (!session?.user.id) {
    return { success: false, error: 'unauthorized' };
  }

  try {
    await deleteSubscription(endpoint);
    return { success: true };
  } catch (error) {
    console.error('Failed to remove push subscription:', error);
    return { success: false, error: 'saveFailed' };
  }
}

/** The explicit "Notify users" action an admin fires after finishing manual money updates. */
export async function notifyMoneyUpdated(): Promise<PushActionResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  const result = await sendPushToAll('moneyUpdated');
  if (result.sent === 0 && result.failed > 0) {
    return { success: false, error: 'sendFailed' };
  }

  return { success: true };
}
