import { NextRequest, NextResponse } from 'next/server';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { decrypt } from './lib/auth';
import { i18n } from './lib/i18n/config';

function getLocale(request: NextRequest): string {
  // 1. Check if locale is already in cookies
  const cookieLocale = request.cookies.get('next-locale')?.value;
  if (cookieLocale && (i18n.locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Use negotiator to detect from headers
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  // @ts-ignore locales are readonly
  const { locales } = i18n;
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages();

  try {
    return matchLocale(languages, locales, i18n.defaultLocale);
  } catch (e) {
    return i18n.defaultLocale;
  }
}

const publicRoutes = ['/sign-in', '/sign-up'];
const publicApiPrefixes = ['/api/cron/'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if it's a public API route first (before locale check)
  const isPublicApiRoute = publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));
  if (isPublicApiRoute) {
    return NextResponse.next();
  }

  // Check if there is any supported locale in the pathname
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  // Redirect if there is no locale
  if (pathnameIsMissingLocale) {
    const locale = getLocale(req);

    // e.g. incoming is /products?season=13
    // The new URL is now /en/products?season=13 — cloning nextUrl keeps the query
    // string, so filters set on a locale-less URL survive the redirect.
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
    return NextResponse.redirect(url);
  }

  // Locale is present
  const segments = pathname.split('/');
  const locale = segments[1];
  const basePathname = `/${segments.slice(2).join('/')}`;

  // 1. Check if it's a public route
  const isPublicRoute = publicRoutes.includes(basePathname);

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // 2. Check for session
  const cookie = req.cookies.get('session')?.value;
  const session = cookie ? await decrypt(cookie) : null;

  // 3. Redirect to sign-in if no valid session
  if (!session) {
    // We must preserve the locale when redirecting to sign-in
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, req.nextUrl));
  }

  // 4. Admin route protection
  if (basePathname.startsWith('/admin') && session.user.role !== 'admin') {
    return NextResponse.redirect(new URL(`/${locale}`, req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (like images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};
