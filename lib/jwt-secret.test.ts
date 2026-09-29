import { describe, expect, it } from 'vitest';
import { resolveJwtSecret } from '@/lib/jwt-secret';

describe('resolveJwtSecret', () => {
  it.each(['production', 'development', 'test'])('uses JWT_SECRET in %s', (NODE_ENV) => {
    expect(resolveJwtSecret({ NODE_ENV, JWT_SECRET: 'real-secret' })).toBe('real-secret');
  });

  it('prefers JWT_SECRET over NEON_AUTH_COOKIE_SECRET', () => {
    expect(resolveJwtSecret({
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt',
      NEON_AUTH_COOKIE_SECRET: 'neon',
    })).toBe('jwt');
  });

  it('falls back to NEON_AUTH_COOKIE_SECRET when JWT_SECRET is missing', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', NEON_AUTH_COOKIE_SECRET: 'neon' })).toBe('neon');
  });

  it.each([
    ['missing', {}],
    ['empty', { JWT_SECRET: '', NEON_AUTH_COOKIE_SECRET: '' }],
  ])('throws in production when the secret is %s', (_, secrets) => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', ...secrets }))
      .toThrow('JWT_SECRET is not defined in environment variables');
  });

  it.each(['development', 'test', undefined])('uses the dev fallback outside production (%s)', (NODE_ENV) => {
    expect(resolveJwtSecret({ NODE_ENV })).toBe('fallback-secret-for-dev-only');
  });
});
