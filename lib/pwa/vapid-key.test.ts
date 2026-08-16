import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './vapid-key';

// A real VAPID public key: base64url, unpadded, 87 characters, 65 raw bytes.
const VAPID_PUBLIC_KEY = 'BPqyxNi0RmV0GNbBfOPQHsGv4i3xk917tw6uVrUGhoyl2RYEPGzVk21lIPy9GctqkV5iFxcIwt0rB_F6YUcGar4';

describe('urlBase64ToUint8Array', () => {
  it('decodes a VAPID public key to the 65 bytes the browser expects', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(65);
    // Uncompressed EC point, which is what the push spec requires.
    expect(bytes[0]).toBe(0x04);
  });

  it('restores missing padding', () => {
    expect(urlBase64ToUint8Array('QQ')).toEqual(new Uint8Array([0x41]));
    expect(urlBase64ToUint8Array('QUJD')).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
  });

  it('translates the base64url alphabet back to base64', () => {
    expect(urlBase64ToUint8Array('-_8')).toEqual(urlBase64ToUint8Array('+/8'));
  });

  it('returns an empty array for an empty key', () => {
    expect(urlBase64ToUint8Array('')).toHaveLength(0);
  });
});
