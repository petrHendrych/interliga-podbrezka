import 'server-only';
import type { Locale } from './config';
import type { Dictionary } from './types';

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  sk: () => import('@/locales/sk.json').then((module) => module.default),
  cs: () => import('@/locales/cs.json').then((module) => module.default),
  hu: () => import('@/locales/hu.json').then((module) => module.default),
  sr: () => import('@/locales/sr.json').then((module) => module.default),
};

export const getDictionary = async (locale: Locale): Promise<Dictionary> => {
  const dictionary = dictionaries[locale];
  if (!dictionary) {
    // Fallback to default locale if requested locale is not found
    return dictionaries.sk();
  }
  return dictionary();
};
