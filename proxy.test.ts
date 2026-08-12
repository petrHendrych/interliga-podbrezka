import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { encrypt } from '@/lib/auth';
import { proxy } from '@/proxy';

const expires = new Date('2026-08-12T12:00:00Z');

async function sessionCookie(role: string): Promise<string> {
  return encrypt({ user: { id: 'u1', role, name: 'Ján' }, expires });
}

function request(url: string, cookies: Record<string, string> = {}, headers: HeadersInit = {}) {
  const req = new NextRequest(new URL(url, 'https://interliga.test'), { headers });
  Object.entries(cookies).forEach(([name, value]) => req.cookies.set(name, value));
  return req;
}

function location(res: Response): URL {
  return new URL(res.headers.get('location')!);
}

describe('public routes', () => {
  it('lets the cron endpoint through untouched', async () => {
    const res = await proxy(request('/api/cron/scrape'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('lets sign-in and the OG image through without a session', async () => {
    expect((await proxy(request('/sk/sign-in'))).headers.get('location')).toBeNull();
    expect((await proxy(request('/sk/opengraph-image'))).headers.get('location')).toBeNull();
  });
});

describe('locale redirect', () => {
  it('adds the default locale when the path has none', async () => {
    const res = await proxy(request('/rules'));
    expect(location(res).pathname).toBe('/sk/rules');
  });

  it('keeps the filters in the query string', async () => {
    const res = await proxy(request('/rules?season=12&league=interliga'));
    expect(location(res).search).toBe('?season=12&league=interliga');
  });

  it('prefers the locale cookie over Accept-Language', async () => {
    const res = await proxy(request('/rules', { 'next-locale': 'hu' }, { 'accept-language': 'cs' }));
    expect(location(res).pathname).toBe('/hu/rules');
  });

  it('negotiates from Accept-Language when there is no cookie', async () => {
    const res = await proxy(request('/rules', {}, { 'accept-language': 'cs-CZ,cs;q=0.9' }));
    expect(location(res).pathname).toBe('/cs/rules');
  });

  it('falls back to Slovak for an unsupported language', async () => {
    const res = await proxy(request('/rules', {}, { 'accept-language': 'ja' }));
    expect(location(res).pathname).toBe('/sk/rules');
  });

  it('ignores a locale cookie that is not one of ours', async () => {
    const res = await proxy(request('/rules', { 'next-locale': 'de' }));
    expect(location(res).pathname).toBe('/sk/rules');
  });
});

describe('session guard', () => {
  it('sends an anonymous visitor to sign-in, keeping the locale', async () => {
    const res = await proxy(request('/hu/rules'));
    expect(location(res).pathname).toBe('/hu/sign-in');
  });

  it('treats an invalid session cookie as no session', async () => {
    const res = await proxy(request('/sk/rules', { session: 'garbage' }));
    expect(location(res).pathname).toBe('/sk/sign-in');
  });

  it('lets a signed-in player through', async () => {
    const res = await proxy(request('/sk/rules', { session: await sessionCookie('player') }));
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('admin guard', () => {
  it('turns a non-admin away from the admin area', async () => {
    const res = await proxy(request('/sk/admin/users', { session: await sessionCookie('player') }));
    expect(location(res).pathname).toBe('/sk');
  });

  it('lets an admin in', async () => {
    const res = await proxy(request('/sk/admin/users', { session: await sessionCookie('admin') }));
    expect(res.headers.get('location')).toBeNull();
  });

  it('drops the query string on the sign-in and admin redirects', async () => {
    // Current behaviour, asserted so a change to it is a deliberate one: unlike the
    // locale redirect above, these build a fresh URL instead of cloning `nextUrl`.
    const res = await proxy(request('/sk/rules?season=12'));
    expect(location(res).search).toBe('');
  });
});
