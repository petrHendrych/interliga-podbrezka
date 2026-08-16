import { describe, expect, it } from 'vitest';
import {
  defaultPasskeyLabel, hostFromSetting, resolveRelyingParty,
} from '@/lib/webauthn-config';

const PRODUCTION = 'interliga-podbrezka.vercel.app';
const ALLOWED = [PRODUCTION];

describe('hostFromSetting', () => {
  it.each([
    // NEXT_PUBLIC_APP_URL is a full URL; VERCEL_URL is a bare host.
    ['https://interliga.sk', 'interliga.sk'],
    ['https://interliga.sk:3000/sk/sign-in', 'interliga.sk'],
    ['interliga-podbrezka.vercel.app', 'interliga-podbrezka.vercel.app'],
    ['  INTERLIGA.sk  ', 'interliga.sk'],
  ])('reads %s as the host %s', (value, expected) => {
    expect(hostFromSetting(value)).toBe(expected);
  });

  it.each([undefined, '', '   ', 'not a url at all'])('returns null for %s', (value) => {
    expect(hostFromSetting(value)).toBeNull();
  });
});

describe('resolveRelyingParty', () => {
  it.each([
    ['localhost:3000', 'localhost', 'http://localhost:3000'],
    ['localhost', 'localhost', 'http://localhost'],
    ['127.0.0.1:3000', '127.0.0.1', 'http://127.0.0.1:3000'],
  ])('lets dev on %s use its own origin over plain HTTP', (host, rpId, origin) => {
    expect(resolveRelyingParty(host, [])).toEqual({ rpId, origin });
  });

  it('answers on an allowed host', () => {
    expect(resolveRelyingParty(PRODUCTION, ALLOWED)).toEqual({
      rpId: PRODUCTION,
      origin: `https://${PRODUCTION}`,
    });
  });

  it('refuses a deployment URL that is not the browsed domain', () => {
    expect(resolveRelyingParty('interliga-podbrezka-abc123.vercel.app', ALLOWED)).toBeNull();
  });

  it('ignores the port on a proxied host', () => {
    expect(resolveRelyingParty(`${PRODUCTION}:443`, ALLOWED)).toEqual({
      rpId: PRODUCTION,
      origin: `https://${PRODUCTION}`,
    });
  });

  it.each([
    // A Host header is caller-controlled, so anything unlisted is refused rather than guessed.
    ['evil.example.com'],
    ['localhost.evil.example.com'],
    [`${PRODUCTION}.evil.example.com`],
    [''],
    [null],
  ])('refuses the unlisted host %s', (host) => {
    expect(resolveRelyingParty(host, ALLOWED)).toBeNull();
  });

  it('refuses every host when nothing is configured', () => {
    expect(resolveRelyingParty(PRODUCTION, [])).toBeNull();
  });
});

describe('defaultPasskeyLabel', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows'],
    ['something else entirely', 'Passkey'],
  ])('names %s as %s', (userAgent, expected) => {
    expect(defaultPasskeyLabel(userAgent)).toBe(expected);
  });
});
