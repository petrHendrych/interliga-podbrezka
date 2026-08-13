import { cookies } from 'next/headers';
import { encrypt, decrypt, type UserPayload } from './auth';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './session-config';

export async function setSession(user: UserPayload) {
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const session = await encrypt({ user, expires });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;
  return decrypt(session);
}

export async function clearSession() {
  const cookieStore = await cookies();
  // The attributes must match the ones setSession wrote, or the browser keeps the old cookie.
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
