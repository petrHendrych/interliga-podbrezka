type SecretEnv = Partial<Record<'JWT_SECRET' | 'NEON_AUTH_COOKIE_SECRET' | 'NODE_ENV', string>>;

const DEV_FALLBACK_SECRET = 'fallback-secret-for-dev-only';

export function resolveJwtSecret(env: SecretEnv): string {
  const secret = env.JWT_SECRET || env.NEON_AUTH_COOKIE_SECRET;
  if (secret) return secret;

  // The fallback is published in this repo, so anyone could forge an admin session with it.
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return DEV_FALLBACK_SECRET;
}

export const jwtKey = new TextEncoder().encode(resolveJwtSecret(process.env));
