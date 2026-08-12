'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { bankWithdrawals } from './db/schema';
import { getSession } from './session';
import { updateSyncedData } from './cache';
import {
  type WithdrawalError,
  type WithdrawalInput,
  validateWithdrawal,
} from './validation/withdrawal';

const WITHDRAWALS_PATH = '/[lang]/withdrawals';
const HOME_PATH = '/[lang]';

export type { WithdrawalError, WithdrawalInput };

export type WithdrawalResult =
  | { success: true; id: number }
  | { success: false; error: WithdrawalError };

export async function createWithdrawal(input: WithdrawalInput): Promise<WithdrawalResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  const validated = validateWithdrawal(input);
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
