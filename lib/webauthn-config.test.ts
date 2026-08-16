import { describe, expect, it } from 'vitest';
import {
  defaultPasskeyLabel, originFromUrl, resolveRelyingParty, rpIdFromUrl,
} from '@/lib/webauthn-config';

const APP_URL = 'https://interliga-podbrezka.vercel.app';

describe('rpIdFromUrl', () => {
  it.each([
    ['https://interliga.sk', 'interliga.sk'],
    ['https://interliga.sk:3000', 'interliga.sk'],
    ['https://interliga.sk/sk/sign-in', 'interliga.sk'],
    ['http://localhost:3000', 'localhost'],
  ])('%s has the relying party id %s', (url, expected) => {
    expect(rpIdFromUrl(url)).toBe(expected);
  });
});

describe('originFromUrl', () => {
  it.each([
    ['https://interliga.sk', 'https://interliga.sk'],
    // The port is part of the origin the authenticator signs, unlike the relying party id.
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://interliga.sk/sk/settings?season=13', 'https://interliga.sk'],
  ])('%s has the origin %s', (url, expected) => {
    expect(originFromUrl(url)).toBe(expected);
  });
});

describe('resolveRelyingParty', () => {
  it.each([
    ['localhost:3000', 'localhost', 'http://localhost:3000'],
    ['localhost', 'localhost', 'http://localhost'],
    ['127.0.0.1:3000', '127.0.0.1', 'http://127.0.0.1:3000'],
  ])('lets dev on %s use its own origin', (host, rpId, origin) => {
    expect(resolveRelyingParty(APP_URL, host)).toEqual({ rpId, origin });
  });

  it.each([
    ['interliga-podbrezka.vercel.app'],
    // A caller-controlled Host header must never move the relying party off the configured one.
    ['evil.example.com'],
    ['localhost.evil.example.com'],
    [null],
  ])('pins %s to the configured URL', (host) => {
    expect(resolveRelyingParty(APP_URL, host)).toEqual({
      rpId: 'interliga-podbrezka.vercel.app',
      origin: APP_URL,
    });
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
