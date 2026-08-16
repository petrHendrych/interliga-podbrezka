'use server';

/* eslint-disable no-console */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { db } from './db';
import { users } from './db/schema';
import { getSession, setSession } from './session';
import { i18n } from './i18n/config';
import {
  CHALLENGE_COOKIE_NAME,
  CHALLENGE_MAX_AGE_SECONDS,
  RP_NAME,
  resolveRelyingParty,
  type RelyingParty,
} from './webauthn-config';
import {
  signChallenge,
  verifyChallenge,
  type ChallengeKind,
  type ChallengePayload,
} from './webauthn-challenge';
import {
  deleteCredential,
  findCredentialWithOwner,
  insertCredential,
  listCredentialsForUser,
  renameCredential,
  touchCredential,
} from './webauthn';
import { validatePasskeyLabel } from './validation/passkey';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type PasskeyActionError =
  | 'unauthorized'
  | 'notApproved'
  | 'unsupported'
  | 'noChallenge'
  | 'verificationFailed'
  | 'alreadyRegistered'
  | 'invalidLabel'
  | 'notFound'
  | 'dbError';

export type PasskeyActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: PasskeyActionError };

async function relyingParty(): Promise<RelyingParty | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return null;

  const headerList = await headers();
  return resolveRelyingParty(appUrl, headerList.get('host'));
}

function resolveLocale(value: unknown): string {
  const lang = typeof value === 'string' ? value : '';
  return (i18n.locales as readonly string[]).includes(lang) ? lang : i18n.defaultLocale;
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  return value.split(',').filter(Boolean) as AuthenticatorTransportFuture[];
}

async function writeChallengeCookie(payload: ChallengePayload): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE_NAME, await signChallenge(payload), {
    maxAge: CHALLENGE_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

async function readChallengeCookie(kind: ChallengeKind): Promise<ChallengePayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyChallenge(token, kind);
}

async function dropChallengeCookie(): Promise<void> {
  const cookieStore = await cookies();
  // The attributes must match the ones writeChallengeCookie wrote, or the browser keeps
  // the old cookie.
  cookieStore.set(CHALLENGE_COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export async function startPasskeyRegistration():
Promise<PasskeyActionResult<PublicKeyCredentialCreationOptionsJSON>> {
  const session = await getSession();
  if (!session?.user.id) return { success: false, error: 'unauthorized' };

  const rp = await relyingParty();
  if (!rp) return { success: false, error: 'unsupported' };

  try {
    const [account] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (!account) return { success: false, error: 'unauthorized' };

    const existing = await listCredentialsForUser(session.user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rp.rpId,
      userName: account.email ?? account.name,
      userDisplayName: account.name,
      userID: new TextEncoder().encode(session.user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
        transports: parseTransports(credential.transports),
      })),
      // A resident key is what lets the sign-in page offer the passkey without an e-mail.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });

    await writeChallengeCookie({
      kind: 'registration',
      challenge: options.challenge,
      userId: session.user.id,
    });

    return { success: true, data: options };
  } catch (error) {
    console.error('Passkey registration start failed:', error);
    return { success: false, error: 'dbError' };
  }
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  label: unknown,
): Promise<PasskeyActionResult> {
  const session = await getSession();
  if (!session?.user.id) return { success: false, error: 'unauthorized' };

  const validLabel = validatePasskeyLabel(label);
  if (validLabel === 'invalidLabel') return { success: false, error: 'invalidLabel' };

  const rp = await relyingParty();
  if (!rp) return { success: false, error: 'unsupported' };

  const stored = await readChallengeCookie('registration');
  if (!stored || stored.userId !== session.user.id) {
    return { success: false, error: 'noChallenge' };
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: false,
    });

    if (!verification.verified) return { success: false, error: 'verificationFailed' };

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await insertCredential({
      userId: session.user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: response.response.transports?.join(',') ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: validLabel,
    });

    return { success: true, data: undefined };
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === '23505') return { success: false, error: 'alreadyRegistered' };
    console.error('Passkey registration failed:', error);
    return { success: false, error: 'verificationFailed' };
  } finally {
    await dropChallengeCookie();
  }
}

export async function startPasskeyAuthentication():
Promise<PasskeyActionResult<PublicKeyCredentialRequestOptionsJSON>> {
  const rp = await relyingParty();
  if (!rp) return { success: false, error: 'unsupported' };

  try {
    // Empty on purpose: the credential is discoverable, so the platform decides what to offer.
    const options = await generateAuthenticationOptions({
      rpID: rp.rpId,
      allowCredentials: [],
      userVerification: 'preferred',
    });

    await writeChallengeCookie({ kind: 'authentication', challenge: options.challenge });

    return { success: true, data: options };
  } catch (error) {
    console.error('Passkey authentication start failed:', error);
    return { success: false, error: 'dbError' };
  }
}

export async function finishPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  lang: unknown,
): Promise<PasskeyActionResult> {
  const rp = await relyingParty();
  if (!rp) return { success: false, error: 'unsupported' };

  const stored = await readChallengeCookie('authentication');
  if (!stored) return { success: false, error: 'noChallenge' };

  let signedIn = false;
  try {
    const credential = await findCredentialWithOwner(response.id);
    // One generic code for an unknown credential and a bad signature alike, so a failed
    // sign-in never tells the caller which accounts exist.
    if (!credential) return { success: false, error: 'verificationFailed' };

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: false,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64url')),
        counter: credential.counter,
        transports: parseTransports(credential.transports),
      },
    });

    if (!verification.verified) return { success: false, error: 'verificationFailed' };

    if (!credential.isApproved) return { success: false, error: 'notApproved' };

    await touchCredential(credential.credentialId, verification.authenticationInfo.newCounter);

    await setSession({
      id: credential.userId,
      role: credential.userRole,
      name: credential.userName,
    });
    signedIn = true;
  } catch (error) {
    console.error('Passkey authentication failed:', error);
    return { success: false, error: 'verificationFailed' };
  } finally {
    await dropChallengeCookie();
  }

  if (signedIn) redirect(`/${resolveLocale(lang)}`);
  return { success: false, error: 'verificationFailed' };
}

export async function deletePasskey(id: number): Promise<PasskeyActionResult> {
  const session = await getSession();
  if (!session?.user.id) return { success: false, error: 'unauthorized' };

  try {
    const removed = await deleteCredential(id, session.user.id);
    if (removed === 0) return { success: false, error: 'notFound' };
    return { success: true, data: undefined };
  } catch (error) {
    console.error('Passkey delete failed:', error);
    return { success: false, error: 'dbError' };
  }
}

export async function renamePasskey(id: number, label: unknown): Promise<PasskeyActionResult> {
  const session = await getSession();
  if (!session?.user.id) return { success: false, error: 'unauthorized' };

  const validLabel = validatePasskeyLabel(label);
  if (validLabel === 'invalidLabel') return { success: false, error: 'invalidLabel' };

  try {
    const updated = await renameCredential(id, session.user.id, validLabel);
    if (updated === 0) return { success: false, error: 'notFound' };
    return { success: true, data: undefined };
  } catch (error) {
    console.error('Passkey rename failed:', error);
    return { success: false, error: 'dbError' };
  }
}
