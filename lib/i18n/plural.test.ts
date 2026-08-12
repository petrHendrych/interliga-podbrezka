import { describe, expect, it } from 'vitest';
import { interpolate } from '@/lib/i18n/config';
import { pluralize } from '@/lib/i18n/plural';

const MATCHES = { one: '{count} zápas', few: '{count} zápasy', other: '{count} zápasov' };

describe('pluralize in Slavic locales', () => {
  it.each(['sk', 'cs', 'sr'] as const)('%s picks one / few / other by count', (locale) => {
    expect(pluralize(locale, 1, MATCHES)).toBe('1 zápas');
    expect(pluralize(locale, 3, MATCHES)).toBe('3 zápasy');
    expect(pluralize(locale, 5, MATCHES)).toBe('5 zápasov');
    expect(pluralize(locale, 0, MATCHES)).toBe('0 zápasov');
  });

  it('sk and cs use the plural form again above twenty', () => {
    expect(pluralize('sk', 22, MATCHES)).toBe('22 zápasov');
  });
});

describe('pluralize in Hungarian', () => {
  const HU = { one: '{count} mérkőzés', few: '{count} mérkőzés', other: '{count} mérkőzés' };

  it('keeps the noun singular after any numeral', () => {
    [0, 1, 2, 5, 22].forEach((count) => {
      expect(pluralize('hu', count, HU)).toBe(`${count} mérkőzés`);
    });
  });
});

describe('interpolate', () => {
  it('replaces every named placeholder', () => {
    expect(interpolate('{name} owes {amount} €', { name: 'Ján', amount: 12 }))
      .toBe('Ján owes 12 €');
  });

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    expect(interpolate('{missing} €', { amount: 12 })).toBe('{missing} €');
  });
});
