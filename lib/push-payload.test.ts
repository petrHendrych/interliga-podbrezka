import { describe, expect, it } from 'vitest';
import cs from '@/locales/cs.json';
import hu from '@/locales/hu.json';
import sk from '@/locales/sk.json';
import sr from '@/locales/sr.json';
import { buildPushPayload, isPushEvent, PUSH_EVENTS } from './push-payload';
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

describe('isPushEvent', () => {
  it.each(PUSH_EVENTS)('accepts %s', (event) => {
    expect(isPushEvent(event)).toBe(true);
  });

  it.each(['', 'dataSync', 'moneyupdated', 'anything'])('rejects %s', (value) => {
    expect(isPushEvent(value)).toBe(false);
  });
});
