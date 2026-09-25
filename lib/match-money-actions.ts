'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { getSession } from './session';
import { updateSyncedData } from './cache';
import { applyMatchMoneyUpdates, MatchMoneyError, type MatchMoneyErrorCode } from './match-money';
import type { MatchMoneyUpdates } from './match-money-payload';

const MONEY_LIST_PATH = '/[lang]/admin/money';
const MONEY_SHEET_PATH = '/[lang]/admin/money/[matchId]';
const PLAYER_PATH = '/[lang]/player/[id]';

export type MatchMoneyActionError = 'unauthorized' | MatchMoneyErrorCode;

export type MatchMoneyActionResult =
  | { success: true }
  | { success: false; error: MatchMoneyActionError };

export async function applyMatchMoney(
  matchId: number,
  updates: MatchMoneyUpdates,
): Promise<MatchMoneyActionResult> {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    return { success: false, error: 'unauthorized' };
  }

  try {
    await applyMatchMoneyUpdates(matchId, updates);

    updateSyncedData();
    revalidatePath(MONEY_LIST_PATH, 'page');
    revalidatePath(MONEY_SHEET_PATH, 'page');
    revalidatePath(PLAYER_PATH, 'page');
    return { success: true };
  } catch (error) {
    if (error instanceof MatchMoneyError) {
      return { success: false, error: error.code };
    }
    console.error('Failed to apply match money:', error);
    return { success: false, error: 'unknown' };
  }
}
