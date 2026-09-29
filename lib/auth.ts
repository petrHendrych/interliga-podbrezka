import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { SESSION_MAX_AGE_SECONDS } from './session-config';
import { jwtKey } from './jwt-secret';

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

export interface SessionPayload {
  user: UserPayload;
  exp?: number;
  iat?: number;
}

export async function encrypt(payload: { user: UserPayload; expires: Date }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(jwtKey);
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(input, jwtKey, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}
