'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { bankWithdrawals } from './db/schema';
import { getSession } from './session';
import { updateSyncedData } from './cache';
import { getSeasonIdForDate } from './season-config';
import { isWithdrawalCategory } from './withdrawal-categories';
import { getStartOfBratislavaToday } from './home-helpers';

const WITHDRAWALS_PATH = '/[lang]/withdrawals';
const HOME_PATH = '/[lang]';

const MAX_WITHDRAWAL = 10_000;
const MIN_DESCRIPTION_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 300;

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type WithdrawalError =
  | 'unauthorized'
  | 'invalidAmount'
  | 'invalidDescription'
  | 'invalidCategory'
  | 'invalidDate'
  | 'notFound'
  | 'unknown';

export type WithdrawalResult =
  | { success: true; id: number }
  | { success: false; error: WithdrawalError };

export interface WithdrawalInput {
  /** Raw field value; parsed here so the client never has to. */
  amount: string;
  description: string;
  category: string;
  /** `YYYY-MM-DD` from the date picker. */
  date: string;
}

interface ValidInput {
  amount: number;
  description: string;
  category: string;
  withdrawnAt: Date;
  seasonId: number;
}

function validate(input: WithdrawalInput): WithdrawalError | ValidInput {
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
  if (input.date > getStartOfBratislavaToday().toISOString().slice(0, 10)) return 'invalidDate';

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

export async function createWithdrawal(input: WithdrawalInput): Promise<WithdrawalResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  const validated = validate(input);
  if (typeof validated === 'string') {
    return { success: false, error: validated };
  }

  try {
    const [created] = await db
      .insert(bankWithdrawals)
      .values({
        amount: validated.amount.toFixed(2),
        description: validated.description,
        category: validated.category,
        withdrawnAt: validated.withdrawnAt,
        seasonId: validated.seasonId,
        createdBy: session.user.id,
      })
      .returning({ id: bankWithdrawals.id });

    updateSyncedData();
    revalidatePath(WITHDRAWALS_PATH, 'page');
    revalidatePath(HOME_PATH, 'page');
    return { success: true, id: created.id };
  } catch (error) {
    console.error('Failed to create bank withdrawal:', error);
    return { success: false, error: 'unknown' };
  }
}

export async function deleteWithdrawal(id: number): Promise<WithdrawalResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  try {
    const deleted = await db
      .delete(bankWithdrawals)
      .where(eq(bankWithdrawals.id, id))
      .returning({ id: bankWithdrawals.id });

    if (deleted.length === 0) {
      return { success: false, error: 'notFound' };
    }

    updateSyncedData();
    revalidatePath(WITHDRAWALS_PATH, 'page');
    revalidatePath(HOME_PATH, 'page');
    return { success: true, id };
  } catch (error) {
    console.error('Failed to delete bank withdrawal:', error);
    return { success: false, error: 'unknown' };
  }
}
