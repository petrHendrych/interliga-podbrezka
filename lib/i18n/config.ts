export const i18n = {
  defaultLocale: 'sk',
  locales: ['sk', 'cs', 'hu', 'sr'],
} as const;

export type Locale = (typeof i18n)['locales'][number];

export function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => params[key]?.toString() ?? match);
}
