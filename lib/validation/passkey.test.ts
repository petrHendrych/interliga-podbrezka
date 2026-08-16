import { describe, expect, it } from 'vitest';
import { validatePasskeyLabel } from '@/lib/validation/passkey';
import { MAX_PASSKEY_LABEL_LENGTH } from '@/lib/webauthn-config';

describe('validatePasskeyLabel', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['a'.repeat(MAX_PASSKEY_LABEL_LENGTH + 1), 'one over the limit'],
  ])('rejects %s (%s)', (label) => {
    expect(validatePasskeyLabel(label)).toBe('invalidLabel');
  });

  it.each([undefined, null, 42, {}])('rejects the non-string %s', (label) => {
    expect(validatePasskeyLabel(label)).toBe('invalidLabel');
  });

  it('accepts a label exactly at the limit', () => {
    const label = 'a'.repeat(MAX_PASSKEY_LABEL_LENGTH);
    expect(validatePasskeyLabel(label)).toBe(label);
  });

  it('trims the surrounding whitespace', () => {
    expect(validatePasskeyLabel('  iPhone  ')).toBe('iPhone');
  });
});
