export const RP_NAME = 'Interliga Podbrezová';

export const CHALLENGE_COOKIE_NAME = 'webauthn-challenge';
export const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

export const MAX_PASSKEY_LABEL_LENGTH = 40;

export interface RelyingParty {
  rpId: string;
  origin: string;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Accepts either a bare host (`VERCEL_URL`) or a full URL (`NEXT_PUBLIC_APP_URL`). */
export function hostFromSetting(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A relying party id is the bare host: no scheme, no port. A passkey is bound to it, so the same
 * credential is invisible on any other domain, preview deployments included.
 *
 * The id has to describe the domain the browser is actually on, so it is read off the request
 * — but a `Host` header is caller-controlled, and letting it choose the relying party would
 * break the origin binding that makes WebAuthn phishing-proof. Hence the allow list: every host
 * this deployment legitimately answers on, and nothing else. Returns null when the request
 * arrives on a host nobody configured, because guessing would be worse than refusing.
 */
export function resolveRelyingParty(
  requestHost: string | null,
  allowedHosts: string[],
): RelyingParty | null {
  const host = (requestHost ?? '').trim().toLowerCase();
  if (!host) return null;

  // Dev runs over plain HTTP, which WebAuthn allows for localhost and nowhere else.
  if (LOCAL_HOST.test(host)) {
    return { rpId: host.split(':')[0], origin: `http://${host}` };
  }

  const hostname = host.split(':')[0];
  if (!allowedHosts.includes(hostname)) return null;

  return { rpId: hostname, origin: `https://${hostname}` };
}

/** A first guess at what the user would call this device, so the add dialog is one tap. */
export function defaultPasskeyLabel(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows';
  return 'Passkey';
}
