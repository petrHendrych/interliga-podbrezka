import { describe, expect, it } from 'vitest';
import { validateReleaseId } from './changelog';

describe('validateReleaseId', () => {
  it.each([1, 42])('accepts %s', (value) => {
    expect(validateReleaseId(value)).toBe(value);
  });

  it.each([0, -1, 1.5, Number.NaN, '3', null, undefined])('rejects %s', (value) => {
    expect(validateReleaseId(value)).toBe('invalidRelease');
  });
});
