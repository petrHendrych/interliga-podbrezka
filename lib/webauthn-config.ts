export const RP_NAME = 'Interliga Podbrezová';

export const CHALLENGE_COOKIE_NAME = 'webauthn-challenge';
export const CHALLENGE_MAX_AGE_SECONDS = 5 * 60;

export const MAX_PASSKEY_LABEL_LENGTH = 40;

/**
 * The relying party id is the bare host: no scheme, no port. A passkey is bound to it, so a
 * credential created on the production domain is invisible on a preview deployment and on
 * localhost, and vice versa.
 */
export function rpIdFromUrl(appUrl: string): string {
  return new URL(appUrl).hostname;
}

/** The origin, in contrast, keeps the port — the authenticator signs the full origin. */
export function originFromUrl(appUrl: string): string {
  return new URL(appUrl).origin;
}

export interface RelyingParty {
  rpId: string;
  origin: string;
}

/**
 * Production is pinned to the configured URL, because a `Host` header is caller-controlled and
 * must never be allowed to choose the relying party. Localhost is the one exception: dev runs
 * on `http://localhost:3000` while `NEXT_PUBLIC_APP_URL` points at the deployed site, and a
 * relying party id that does not match the origin fails the ceremony outright.
 */
export function resolveRelyingParty(appUrl: string, requestHost: string | null): RelyingParty {
  const host = requestHost ?? '';
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return { rpId: host.split(':')[0], origin: `http://${host}` };
  }
  return { rpId: rpIdFromUrl(appUrl), origin: originFromUrl(appUrl) };
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
