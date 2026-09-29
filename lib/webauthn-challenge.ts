import { SignJWT, jwtVerify } from 'jose';
import { CHALLENGE_MAX_AGE_SECONDS } from './webauthn-config';
import { jwtKey } from './jwt-secret';

export type ChallengeKind = 'registration' | 'authentication';

export interface ChallengePayload {
  kind: ChallengeKind;
  challenge: string;
  /** Only set for a registration, so it stays tied to the session that started it. */
  userId?: string;
}

export async function signChallenge(payload: ChallengePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE_SECONDS}s`)
    .sign(jwtKey);
}

/** Returns null for a tampered, expired, or wrong-kind token, so a registration challenge
 *  can never be replayed into an authentication. */
export async function verifyChallenge(
  token: string,
  kind: ChallengeKind,
): Promise<ChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey, { algorithms: ['HS256'] });
    const parsed = payload as unknown as ChallengePayload;
    if (parsed.kind !== kind || typeof parsed.challenge !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}
