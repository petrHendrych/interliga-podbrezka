import { describe, expect, it } from 'vitest';
import cs from '@/locales/cs.json';
import hu from '@/locales/hu.json';
import sk from '@/locales/sk.json';
import sr from '@/locales/sr.json';
import {
  buildPushPayload, isPushEvent, pushPath, PUSH_EVENTS, type PushEvent,
} from './push-payload';
import { pluralize } from './i18n/plural';
import type { Locale } from './i18n/config';
import type { Dictionary } from './i18n/types';

const DICTIONARIES: [Locale, Dictionary['push']][] = [
  ['sk', sk.push],
  ['cs', cs.push],
  ['hu', hu.push],
  ['sr', sr.push],
];

describe('buildPushPayload', () => {
  it.each(DICTIONARIES)('uses the %s dictionary and deep links into that locale', (lang, push) => {
    PUSH_EVENTS.forEach((event) => {
      const payload = buildPushPayload(event, lang, push);

      expect(payload.title).toBe(push.events[event].title);
      expect(payload.body).toBe(push.events[event].body);
      expect(payload.url.startsWith(`/${lang}/`)).toBe(true);
      expect(payload.tag).toBe(`ilp-${event}`);
    });
  });

  it('gives every locale a non-empty title and body', () => {
    DICTIONARIES.forEach(([lang, push]) => {
      PUSH_EVENTS.forEach((event) => {
        const payload = buildPushPayload(event, lang, push);

        expect(payload.title.length).toBeGreaterThan(0);
        expect(payload.body.length).toBeGreaterThan(0);
      });
    });
  });

  it('keeps two events apart', () => {
    const synced = buildPushPayload('matchResult', 'sk', sk.push);
    const money = buildPushPayload('moneyUpdated', 'sk', sk.push);

    expect(synced.tag).not.toBe(money.tag);
    expect(synced.title).not.toBe(money.title);
  });

  it('interpolates params into the title and the body', () => {
    const push = {
      events: {
        matchResult: { title: '{count} nové', body: 'Vyhrali sme {score} proti {opponent}' },
        moneyUpdated: { title: 'x', body: 'y' },
      },
    } as unknown as Dictionary['push'];

    const payload = buildPushPayload('matchResult', 'sk', push, {
      count: 3,
      score: 3480,
      opponent: 'Trenčín',
    });

    expect(payload.title).toBe('3 nové');
    expect(payload.body).toBe('Vyhrali sme 3480 proti Trenčín');
  });

  it('leaves an unknown placeholder untouched instead of printing undefined', () => {
    const push = {
      events: {
        matchResult: { title: 'a', body: 'Dlhuješ {amount} €' },
        moneyUpdated: { title: 'x', body: 'y' },
      },
    } as unknown as Dictionary['push'];

    expect(buildPushPayload('matchResult', 'sk', push).body).toBe('Dlhuješ {amount} €');
  });

  it('carries a counted noun built with pluralize, which the caller passes in', () => {
    const forms = { one: '{count} zápas', few: '{count} zápasy', other: '{count} zápasov' };
    const push = {
      events: {
        matchResult: { title: 'a', body: 'Pribudlo {matches}' },
        moneyUpdated: { title: 'x', body: 'y' },
      },
    } as unknown as Dictionary['push'];

    const body = (count: number) => buildPushPayload('matchResult', 'sk', push, {
      matches: pluralize('sk', count, forms),
    }).body;

    expect(body(1)).toBe('Pribudlo 1 zápas');
    expect(body(3)).toBe('Pribudlo 3 zápasy');
    expect(body(5)).toBe('Pribudlo 5 zápasov');
  });
});

const MATCH_EVENTS: PushEvent[] = [
  'finePaid', 'bonusPaid', 'trainerPaid', 'unsettledMatch', 'substitutionReview',
];
const MONEY_LIST_EVENTS: PushEvent[] = [
  'moneyUpdated', 'fineAdded', 'bonusEarned', 'streakWarning', 'debtReminder',
];

describe('buildPushPayload deep links', () => {
  it.each(DICTIONARIES)('opens the match money sheet in %s for a single-match event', (lang, push) => {
    MATCH_EVENTS.forEach((event) => {
      expect(buildPushPayload(event, lang, push, { matchId: 44568 }).url).toBe(`/${lang}/money/44568`);
    });
  });

  it.each(MATCH_EVENTS)('falls back to the money list for %s without a match id', (event) => {
    expect(buildPushPayload(event, 'sk', sk.push).url).toBe('/sk/money');
  });

  it.each([['abc'], [0], [-1], [1.5], ['12/../admin']])(
    'ignores the untrusted match id %o and opens the money list',
    (matchId) => {
      expect(pushPath('finePaid', { matchId })).toBe('money');
    },
  );

  it.each(MONEY_LIST_EVENTS)('opens the money list for %s, even when a match id is passed', (event) => {
    expect(buildPushPayload(event, 'sk', sk.push, { matchId: 44568 }).url).toBe('/sk/money');
  });

  it('keeps the other events where they were', () => {
    expect(pushPath('bankWithdrawal')).toBe('withdrawals');
    expect(pushPath('userAwaitingApproval')).toBe('admin/users');
    expect(pushPath('matchResult', { matchId: 44568 })).toBe('');
    expect(pushPath('scrapeFailed')).toBe('');
  });
});

describe('isPushEvent', () => {
  it.each(PUSH_EVENTS)('accepts %s', (event) => {
    expect(isPushEvent(event)).toBe(true);
  });

  it.each(['', 'dataSync', 'moneyupdated', 'anything'])('rejects %s', (value) => {
    expect(isPushEvent(value)).toBe(false);
  });
});
