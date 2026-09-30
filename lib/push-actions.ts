'use server';

/* eslint-disable no-console */

import { getSession } from './session';
import {
  deleteSubscription,
  parseLocale,
  parseSubscription,
  saveSubscription,
} from './push-subscriptions';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type PushActionError = 'unauthorized' | 'saveFailed';

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
