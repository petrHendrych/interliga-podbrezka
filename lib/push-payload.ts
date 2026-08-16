import { interpolate, type Locale } from './i18n/config';
import type { Dictionary } from './i18n/types';

export const PUSH_EVENTS = [
  'matchResult',
  'matchResults',
  'bonusEarned',
  'fineAdded',
  'streakWarning',
  'debtReminder',
  'moneyUpdated',
  'bankWithdrawal',
  'userAwaitingApproval',
  'scrapeFailed',
  'scrapeStuck',
  'unsettledMatch',
] as const;

export type PushEvent = (typeof PUSH_EVENTS)[number];

export type PushParams = Record<string, string | number>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Where tapping the notification lands, relative to `/{lang}/`. */
const EVENT_PATHS: Record<PushEvent, string> = {
  matchResult: '',
  matchResults: '',
  bonusEarned: '',
  fineAdded: '',
  streakWarning: '',
  debtReminder: '',
  moneyUpdated: '',
  bankWithdrawal: 'withdrawals',
  userAwaitingApproval: 'admin/users',
  scrapeFailed: '',
  scrapeStuck: '',
  unsettledMatch: '',
};

export function isPushEvent(value: string): value is PushEvent {
  return (PUSH_EVENTS as readonly string[]).includes(value);
}

export function buildPushPayload(
  event: PushEvent,
  lang: Locale,
  push: Dictionary['push'],
  params: PushParams = {},
): PushPayload {
  const strings = push.events[event];

  return {
    title: interpolate(strings.title, params),
    body: interpolate(strings.body, params),
    url: `/${lang}/${EVENT_PATHS[event]}`,
    // One tag per event, so a repeated broadcast replaces the old notification
    // instead of stacking a second copy on the lock screen.
    tag: `ilp-${event}`,
  };
}
