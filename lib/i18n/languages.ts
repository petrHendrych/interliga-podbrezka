import {
  SK, CZ, HU, RS,
} from 'country-flag-icons/react/3x2';

export const LANGUAGES = [
  { code: 'sk', name: 'Slovenčina', Flag: SK },
  { code: 'cs', name: 'Čeština', Flag: CZ },
  { code: 'hu', name: 'Magyar', Flag: HU },
  { code: 'sr', name: 'Srpski', Flag: RS },
] as const;

export function changeLanguage(newLang: string, currentLang: string, pathname: string) {
  if (newLang === currentLang) return;
  localStorage.setItem('next-locale', newLang);
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `next-locale=${newLang}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
  const segments = pathname.split('/');
  if (segments.length > 1) {
    segments[1] = newLang;
  }
  const nextPathname = segments.length > 1 ? segments.join('/') : `/${newLang}`;

  // usePathname() drops the query string, so active filters (?season=, ?league=)
  // have to be re-attached from the live URL.
  const { search, hash } = window.location;
  window.location.href = `${nextPathname}${search}${hash}`;
}
