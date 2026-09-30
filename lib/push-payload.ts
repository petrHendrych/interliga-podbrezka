import { interpolate, type Locale } from './i18n/config';
import type { Dictionary } from './i18n/types';

export const PUSH_EVENTS = [
  'matchResult',
  'matchResults',
  'bonusEarned',
  'fineAdded',
  'streakWarning',
  'finePaid',
  'bonusPaid',
  'trainerPaid',
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
  bonusEarned: 'money',
  fineAdded: 'money',
  streakWarning: 'money',
  finePaid: 'money',
  bonusPaid: 'money',
  trainerPaid: 'money',
  debtReminder: 'money',
  moneyUpdated: 'money',
  bankWithdrawal: 'withdrawals',
  userAwaitingApproval: 'admin/users',
  scrapeFailed: '',
  scrapeStuck: '',
  unsettledMatch: 'money',
};

const MATCH_EVENTS: ReadonlySet<PushEvent> = new Set<PushEvent>([
  'finePaid', 'bonusPaid', 'trainerPaid', 'unsettledMatch',
]);

export function isPushEvent(value: string): value is PushEvent {
  return (PUSH_EVENTS as readonly string[]).includes(value);
}

/**
 * Events about a single match open that match's money sheet. The id is checked because
 * personal pushes also arrive over HTTP from the CLI, so it is not taken on trust.
 */
export function pushPath(event: PushEvent, params: PushParams = {}): string {
  const matchId = Number(params.matchId);
  if (MATCH_EVENTS.has(event) && Number.isInteger(matchId) && matchId > 0) {
    return `money/${matchId}`;
  }
  return EVENT_PATHS[event];
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
    url: `/${lang}/${pushPath(event, params)}`,
    // One tag per event, so a repeated broadcast replaces the old notification
    // instead of stacking a second copy on the lock screen.
    tag: `ilp-${event}`,
  };
}
