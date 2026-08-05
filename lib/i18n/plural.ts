import { interpolate, type Locale } from './config';

export interface PluralForms {
  one: string;
  few: string;
  other: string;
}

/**
 * Slavic locales need three forms (1 zápas / 3 zápasy / 5 zápasov); Hungarian
 * keeps the noun singular after any numeral, so all three forms are identical there.
 */
export function pluralize(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(locale).select(count);
  let form = forms.other;
  if (category === 'one') form = forms.one;
  else if (category === 'few') form = forms.few;

  return interpolate(form, { count });
}
