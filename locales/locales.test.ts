import { describe, expect, it } from 'vitest';
import cs from '@/locales/cs.json';
import hu from '@/locales/hu.json';
import sk from '@/locales/sk.json';
import sr from '@/locales/sr.json';

type Json = Record<string, unknown>;

const TRANSLATIONS: [string, Json][] = [['cs', cs], ['hu', hu], ['sr', sr]];

function flatten(value: Json, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (typeof entry === 'string') {
      acc[`${prefix}${key}`] = entry;
    } else if (entry && typeof entry === 'object') {
      Object.assign(acc, flatten(entry as Json, `${prefix}${key}.`));
    }
    return acc;
  }, {});
}

function placeholders(text: string): string[] {
  return (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
}

const slovak = flatten(sk as Json);

describe('locale files', () => {
  it.each(TRANSLATIONS)('%s has exactly the same keys as sk', (_locale, dict) => {
    const keys = Object.keys(flatten(dict));

    expect(keys.filter((k) => !(k in slovak))).toEqual([]);
    expect(Object.keys(slovak).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it.each(TRANSLATIONS)('%s uses the same placeholders as sk in every string', (_locale, dict) => {
    const translated = flatten(dict);
    const mismatched = Object.entries(slovak)
      .filter(([key, text]) => (
        placeholders(translated[key] ?? '').join(',') !== placeholders(text).join(',')
      ))
      .map(([key]) => key);

    expect(mismatched).toEqual([]);
  });

  it('translates the rules page, which must move with every money rule change', () => {
    TRANSLATIONS.forEach(([, dict]) => {
      const translated = flatten(dict);
      const rulesKeys = Object.keys(slovak).filter((k) => k.startsWith('rules.'));

      expect(rulesKeys.length).toBeGreaterThan(0);
      rulesKeys.forEach((key) => expect(translated[key]).toBeTruthy());
    });
  });
});
