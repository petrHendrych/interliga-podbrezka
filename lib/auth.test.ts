import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  decrypt, encrypt, hashPassword, verifyPassword,
} from '@/lib/auth';
import { SESSION_MAX_AGE_SECONDS } from '@/lib/session-config';

const user = { id: 'u1', role: 'admin', name: 'Ján Novák' };
const expires = new Date('2026-08-12T12:00:00Z');

describe('password hashing', () => {
  it('verifies the password it hashed', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash).not.toBe('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('session tokens', () => {
  it('round-trips the user payload', async () => {
    const token = await encrypt({ user, expires });
    expect(await decrypt(token)).toMatchObject({ user });
  });

  it('expires the token after the shared max age regardless of the cookie expiry', async () => {
    const token = await encrypt({ user, expires: new Date('2030-01-01T00:00:00Z') });
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

    expect(claims.exp - claims.iat).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('surfaces exp and iat so the proxy can decide whether to refresh', async () => {
    const session = await decrypt(await encrypt({ user, expires }));

    expect(session?.exp).toBeTypeOf('number');
    expect(session?.iat).toBeTypeOf('number');
    expect(session!.exp! - session!.iat!).toBe(SESSION_MAX_AGE_SECONDS);
  });

  it('returns null for a tampered, malformed or foreign-signed token', async () => {
    const token = await encrypt({ user, expires });
    const foreign = await new SignJWT({ user })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode('someone-elses-secret'));

    expect(await decrypt(`${token}x`)).toBeNull();
    expect(await decrypt('not-a-token')).toBeNull();
    expect(await decrypt(foreign)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const expired = await new SignJWT({ user })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(0)
      .setExpirationTime(60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    expect(await decrypt(expired)).toBeNull();
  });
});
