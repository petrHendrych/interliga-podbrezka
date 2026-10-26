/** Error codes the client maps to a localized message; raw messages never reach it. */
export type ChangelogSeenError = 'unauthorized' | 'invalidRelease' | 'genericError';

export function validateReleaseId(value: unknown): number | 'invalidRelease' {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 'invalidRelease';
}
