import { NextRequest, NextResponse } from 'next/server';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { decrypt, encrypt, type SessionPayload } from './lib/auth';
import { i18n } from './lib/i18n/config';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SESSION_REFRESH_AFTER_SECONDS,
} from './lib/session-config';

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

// The OG image is fetched by unauthenticated crawlers, so it must stay open or
// link previews render the sign-in redirect instead of the image.
// The offline page is precached by the service worker, possibly before the first sign-in, and
// an expired session must not turn the offline fallback into a sign-in redirect that also fails.
const publicRoutes = ['/sign-in', '/sign-up', '/opengraph-image', '/offline'];
// API routes carry no locale segment, so without this the proxy redirects them to
// /sk/api/... instead of running them. Each one authenticates itself, with the cron
// secret or a session.
const publicApiPrefixes = ['/api/cron/', '/api/revalidate', '/api/push/'];

// Re-issued only once the token is past the halfway mark, so a Set-Cookie is not attached to
// every single response. The attributes must match the ones setSession() writes.
async function refreshSessionCookie(response: NextResponse, session: SessionPayload) {
  const expiresAt = session.exp;
  if (!expiresAt) return;

  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  if (secondsLeft > SESSION_REFRESH_AFTER_SECONDS) return;

  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  response.cookies.set(SESSION_COOKIE_NAME, await encrypt({ user: session.user, expires }), {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

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
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
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

  const response = NextResponse.next();
  await refreshSessionCookie(response, session);
  return response;
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
