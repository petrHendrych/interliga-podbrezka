import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from './lib/auth';

const publicRoutes = ['/sign-in', '/sign-up', '/forgot-password', '/reset-password'];
const publicApiPrefixes = ['/api/cron/'];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Check if it's a public route or public API
  const isPublicRoute = publicRoutes.includes(pathname);
  const isPublicApiRoute = publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isPublicRoute || isPublicApiRoute) {
    return NextResponse.next();
  }

  // 2. Check for session
  const cookie = req.cookies.get('session')?.value;
  const session = cookie ? await decrypt(cookie) : null;

  // 3. Redirect to sign-in if no valid session
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl));
  }

  // 4. Admin route protection
  if (pathname.startsWith('/admin') && session.user.role !== 'admin') {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  // 5. Continue
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
