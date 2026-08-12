export const WITHDRAWAL_CATEGORIES = ['food', 'equipment', 'travel', 'other'] as const;

export type WithdrawalCategory = (typeof WITHDRAWAL_CATEGORIES)[number];

export function isWithdrawalCategory(value: string): value is WithdrawalCategory {
  return (WITHDRAWAL_CATEGORIES as readonly string[]).includes(value);
}
