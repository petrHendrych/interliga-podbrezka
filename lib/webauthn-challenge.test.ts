import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import { SignJWT } from 'jose';
import { signChallenge, verifyChallenge } from '@/lib/webauthn-challenge';
import { CHALLENGE_MAX_AGE_SECONDS } from '@/lib/webauthn-config';

const CHALLENGE = 'a-random-base64url-challenge';

afterEach(() => {
  vi.useRealTimers();
});

describe('webauthn challenge tokens', () => {
  it('round-trips a registration challenge with its user id', async () => {
    const token = await signChallenge({
      kind: 'registration',
      challenge: CHALLENGE,
      userId: 'u1',
    });

    expect(await verifyChallenge(token, 'registration')).toMatchObject({
      kind: 'registration',
      challenge: CHALLENGE,
      userId: 'u1',
    });
  });

  it('round-trips an authentication challenge, which carries no user id', async () => {
    const token = await signChallenge({ kind: 'authentication', challenge: CHALLENGE });
    const payload = await verifyChallenge(token, 'authentication');

    expect(payload?.challenge).toBe(CHALLENGE);
    expect(payload?.userId).toBeUndefined();
  });

  it('refuses to read a registration challenge as an authentication one', async () => {
    const token = await signChallenge({
      kind: 'registration',
      challenge: CHALLENGE,
      userId: 'u1',
    });

    expect(await verifyChallenge(token, 'authentication')).toBeNull();
  });

  it('returns null for a tampered, malformed or foreign-signed token', async () => {
    const token = await signChallenge({ kind: 'authentication', challenge: CHALLENGE });
    const foreign = await new SignJWT({ kind: 'authentication', challenge: CHALLENGE })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode('someone-elses-secret'));

    expect(await verifyChallenge(`${token}x`, 'authentication')).toBeNull();
    expect(await verifyChallenge('not-a-token', 'authentication')).toBeNull();
    expect(await verifyChallenge(foreign, 'authentication')).toBeNull();
  });

  it('expires once the five minute window has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T10:00:00Z'));

    const token = await signChallenge({ kind: 'authentication', challenge: CHALLENGE });

    vi.setSystemTime(new Date(Date.now() + (CHALLENGE_MAX_AGE_SECONDS - 1) * 1000));
    expect(await verifyChallenge(token, 'authentication')).not.toBeNull();

    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(await verifyChallenge(token, 'authentication')).toBeNull();
  });
});
