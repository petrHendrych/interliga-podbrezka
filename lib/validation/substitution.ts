import type { SheetSubstitution } from '@/lib/substitutions';

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type SubstitutionSplitError = 'notFound' | 'invalidFaultSplit' | 'paidLocked';

export interface SubstitutionSplitUpdate {
  id: number;
  substituteLaneFaults: number;
}

/**
 * Only a mid-lane switch whose lane has faults takes an admin split, and only a whole count from
 * 0 to that lane's faults. A paid row is money that changed hands, so moving faults onto or off
 * it is refused.
 */
export function validateSubstitutionSplit(
  update: SubstitutionSplitUpdate,
  substitution: SheetSubstitution | undefined,
  paidUserIds: ReadonlySet<string>,
): SubstitutionSplitError | null {
  if (!substitution) return 'notFound';

  const value = update.substituteLaneFaults;
  if (!substitution.mid_lane || substitution.lane_faults === 0) return 'invalidFaultSplit';
  if (!Number.isInteger(value) || value < 0 || value > substitution.lane_faults) {
    return 'invalidFaultSplit';
  }

  if (paidUserIds.has(substitution.starter_user_id)
    || paidUserIds.has(substitution.substitute_user_id)) {
    return 'paidLocked';
  }
  return null;
}
