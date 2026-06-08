export const i18n = {
  defaultLocale: 'sk',
  locales: ['sk', 'cs', 'hu', 'sr'],
} as const;

export type Locale = (typeof i18n)['locales'][number];
