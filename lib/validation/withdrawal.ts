import { getStartOfBratislavaToday } from '@/lib/dates';
import { getSeasonIdForDate } from '@/lib/season-config';
import { isWithdrawalCategory, type WithdrawalCategory } from '@/lib/withdrawal-categories';

export const MAX_WITHDRAWAL = 10_000;
export const MIN_DESCRIPTION_LENGTH = 3;
export const MAX_DESCRIPTION_LENGTH = 300;

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type WithdrawalError =
  | 'unauthorized'
  | 'invalidAmount'
  | 'invalidDescription'
  | 'invalidCategory'
  | 'invalidDate'
  | 'notFound'
  | 'unknown';

export interface WithdrawalInput {
  /** Raw field value; parsed here so the client never has to. */
  amount: string;
  description: string;
  category: string;
  /** `YYYY-MM-DD` from the date picker. */
  date: string;
}

export interface ValidWithdrawal {
  amount: number;
  description: string;
  /** Narrowed by `isWithdrawalCategory` below, so callers can index the label map with it. */
  category: WithdrawalCategory;
  withdrawnAt: Date;
  seasonId: number;
}

/** `now` is injectable so the "not in the future" rule can be tested without the clock. */
export function validateWithdrawal(
  input: WithdrawalInput,
  now: Date = new Date(),
): WithdrawalError | ValidWithdrawal {
  const amount = Number.parseFloat(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_WITHDRAWAL) return 'invalidAmount';

  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION_LENGTH
    || description.length > MAX_DESCRIPTION_LENGTH) {
    return 'invalidDescription';
  }

  if (!isWithdrawalCategory(input.category)) return 'invalidCategory';

  // Midday UTC keeps the stored day stable across the Bratislava offset.
  const withdrawnAt = new Date(`${input.date}T12:00:00Z`);
  if (!input.date || Number.isNaN(withdrawnAt.getTime())) return 'invalidDate';
  if (input.date > getStartOfBratislavaToday(now).toISOString().slice(0, 10)) return 'invalidDate';

  const seasonId = getSeasonIdForDate(withdrawnAt);
  if (seasonId === null) return 'invalidDate';

  return {
    amount: Math.round(amount * 100) / 100,
    description,
    category: input.category,
    withdrawnAt,
    seasonId,
  };
}
