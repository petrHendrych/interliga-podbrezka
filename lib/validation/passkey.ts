import { MAX_PASSKEY_LABEL_LENGTH } from '@/lib/webauthn-config';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type PasskeyLabelError = 'invalidLabel';

export function validatePasskeyLabel(label: unknown): PasskeyLabelError | string {
  if (typeof label !== 'string') return 'invalidLabel';

  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PASSKEY_LABEL_LENGTH) return 'invalidLabel';

  return trimmed;
}
