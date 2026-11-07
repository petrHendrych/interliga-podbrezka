'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { getSession } from './session';
import { logActivity } from './activity-log';
import { updateSyncedData } from './cache';
import { sendPersonalMoneyPushes } from './push';
import { isUuid } from './trainer-matches';
import {
  settlePlayer, settleTrainer, SettleUpError, type SettleUpErrorCode, type SettleUpResult,
} from './settle-up';
import type { SettlementSelection } from './settle-up-summary';

const MONEY_LIST_PATH = '/[lang]/money';
const MONEY_SHEET_PATH = '/[lang]/money/[matchId]';
const PLAYER_PATH = '/[lang]/player/[id]';
const TRAINER_PATH = '/[lang]/trainer/[id]';

export type SettleUpActionError = 'unauthorized' | 'invalid' | 'unknown' | SettleUpErrorCode;

export type SettleUpActionResult =
  | { success: true }
  | { success: false; error: SettleUpActionError };

function isIdList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id > 0);
}

async function runSettlement(
  action: string,
  details: Record<string, string | number>,
  inputError: SettleUpActionError | null,
  settle: () => Promise<SettleUpResult>,
): Promise<SettleUpActionResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }
  if (inputError) {
    return { success: false, error: inputError };
  }

  try {
    const result = await settle();

    updateSyncedData();
    revalidatePath(MONEY_LIST_PATH, 'page');
    revalidatePath(MONEY_SHEET_PATH, 'page');
    revalidatePath(PLAYER_PATH, 'page');
    revalidatePath(TRAINER_PATH, 'page');
    await sendPersonalMoneyPushes(result.push ? [result.push] : []);
    logActivity('admin', action, { ...details, rows: result.rows }, session.user);
    return { success: true };
  } catch (error) {
    if (error instanceof SettleUpError) {
      return { success: false, error: error.code };
    }
    console.error(`Failed to ${action}:`, error);
    return { success: false, error: 'unknown' };
  }
}

export async function settlePlayerMoney(
  externalPlayerId: number,
  seasonId: number,
  shown: SettlementSelection,
): Promise<SettleUpActionResult> {
  const valid = Number.isSafeInteger(externalPlayerId) && Number.isSafeInteger(seasonId)
    && isIdList(shown?.fineMatchIds) && isIdList(shown?.bonusMatchIds);

  return runSettlement(
    'settlePlayerMoney',
    { externalPlayerId, seasonId },
    valid ? null : 'invalid',
    () => settlePlayer(externalPlayerId, seasonId, shown),
  );
}

export async function settleTrainerMoney(
  trainerId: string,
  seasonId: number,
  shownPaymentIds: number[],
): Promise<SettleUpActionResult> {
  let inputError: SettleUpActionError | null = null;
  if (typeof trainerId !== 'string' || !isUuid(trainerId)) inputError = 'notFound';
  else if (!Number.isSafeInteger(seasonId) || !isIdList(shownPaymentIds)) inputError = 'invalid';

  return runSettlement(
    'settleTrainerMoney',
    { trainerId, seasonId },
    inputError,
    () => settleTrainer(trainerId, seasonId, shownPaymentIds),
  );
}
