import type { PersonalPush } from './push-digest';

export interface PlayerSettlementRow {
  matchId: number;
  opponent: string | null;
  /** `calculated_fine + streak_fine`: the single `is_paid` settles both. */
  fine: number;
  bonus: number;
  isPaid: boolean;
  isBonusPaid: boolean;
  needsFaultSplit: boolean;
}

export interface PendingSplit {
  matchId: number;
  opponent: string | null;
}

export interface SettlementSelection {
  fineMatchIds: number[];
  bonusMatchIds: number[];
}

export interface PlayerSettlement extends SettlementSelection {
  fines: number;
  bonuses: number;
  /** Positive: the player pays the bank. Negative: the bank pays the player. */
  net: number;
  pendingSplit: PendingSplit[];
}

export interface TrainerSettlementRow {
  id: number;
  matchId: number;
  amount: number;
  isPaid: boolean;
}

export interface TrainerSettlement {
  paymentIds: number[];
  matchCount: number;
  total: number;
}

function sumCents(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100;
}

export function summarizePlayerSettlement(rows: PlayerSettlementRow[]): PlayerSettlement {
  const fineRows = rows.filter((row) => !row.isPaid && row.fine > 0);
  const bonusRows = rows.filter((row) => !row.isBonusPaid && row.bonus > 0);
  const fines = sumCents(fineRows.map((row) => row.fine));
  const bonuses = sumCents(bonusRows.map((row) => row.bonus));

  return {
    fineMatchIds: fineRows.map((row) => row.matchId),
    bonusMatchIds: bonusRows.map((row) => row.matchId),
    fines,
    bonuses,
    net: sumCents([fines, -bonuses]),
    // Paying a row locks its substitution split, and only the fine depends on that split.
    pendingSplit: fineRows
      .filter((row) => row.needsFaultSplit)
      .map(({ matchId, opponent }) => ({ matchId, opponent })),
  };
}

/** The admin confirmed what the dialog showed, so nothing beyond it is ever settled. */
export function selectStillOpen(
  settlement: PlayerSettlement,
  shown: SettlementSelection,
): SettlementSelection {
  const fineIds = new Set(shown.fineMatchIds);
  const bonusIds = new Set(shown.bonusMatchIds);

  return {
    fineMatchIds: settlement.fineMatchIds.filter((id) => fineIds.has(id)),
    bonusMatchIds: settlement.bonusMatchIds.filter((id) => bonusIds.has(id)),
  };
}

/** What a confirmed selection actually settles, for the notification. */
export function settledAmounts(
  rows: PlayerSettlementRow[],
  selection: SettlementSelection,
): { fines: number; bonuses: number } {
  const fineIds = new Set(selection.fineMatchIds);
  const bonusIds = new Set(selection.bonusMatchIds);
  const { fines, bonuses } = summarizePlayerSettlement(rows.map((row) => ({
    ...row,
    isPaid: row.isPaid || !fineIds.has(row.matchId),
    isBonusPaid: row.isBonusPaid || !bonusIds.has(row.matchId),
  })));
  return { fines, bonuses };
}

export function summarizeTrainerSettlement(rows: TrainerSettlementRow[]): TrainerSettlement {
  const open = rows.filter((row) => !row.isPaid && row.amount > 0);

  return {
    paymentIds: open.map((row) => row.id),
    matchCount: new Set(open.map((row) => row.matchId)).size,
    total: sumCents(open.map((row) => row.amount)),
  };
}

export function playerSettlementPush(
  userId: string,
  fines: number,
  bonuses: number,
): PersonalPush | null {
  if (fines > 0 && bonuses > 0) {
    return { userId, event: 'moneySettled', params: { fines, bonuses } };
  }
  if (fines > 0) return { userId, event: 'finesSettled', params: { fines } };
  if (bonuses > 0) return { userId, event: 'bonusesSettled', params: { bonuses } };
  return null;
}

export function trainerSettlementPush(userId: string, total: number): PersonalPush | null {
  if (total <= 0) return null;
  return { userId, event: 'trainerSettled', params: { amount: total } };
}
