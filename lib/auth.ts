import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.JWT_SECRET || process.env.NEON_AUTH_COOKIE_SECRET || 'fallback-secret-for-dev-only';
const key = new TextEncoder().encode(secretKey);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export interface UserPayload {
  id: string;
  role: string;
  name: string;
}

export async function encrypt(payload: { user: UserPayload; expires: Date }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(key);
}

export async function decrypt(input: string): Promise<{ user: UserPayload } | null> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ['HS256'],
    });
    return payload as unknown as { user: UserPayload };
  } catch (error) {
    return null;
  }
}
