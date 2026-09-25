export interface PlayerMoneyUpdate {
  userId: string;
  fullFaults?: number;
  secondToLastFaults?: number;
  isPaid?: boolean;
  isBonusPaid?: boolean;
}

export interface TrainerPaymentUpdate {
  id: number;
  isPaid: boolean;
}

export interface MatchMoneyUpdates {
  players?: PlayerMoneyUpdate[];
  trainerPayments?: TrainerPaymentUpdate[];
}

export type PaymentTarget =
  | { kind: 'fine'; userId: string }
  | { kind: 'bonus'; userId: string }
  | { kind: 'trainer'; paymentId: number };

function playerFlag(target: Exclude<PaymentTarget, { kind: 'trainer' }>, isPaid: boolean): PlayerMoneyUpdate {
  return target.kind === 'fine'
    ? { userId: target.userId, isPaid }
    : { userId: target.userId, isBonusPaid: isPaid };
}

/** One toggle → one-entry payload; the other flags stay untouched by the read-modify-write. */
export function paymentPayload(target: PaymentTarget, isPaid: boolean): MatchMoneyUpdates {
  if (target.kind === 'trainer') {
    return { trainerPayments: [{ id: target.paymentId, isPaid }] };
  }
  return { players: [playerFlag(target, isPaid)] };
}

/** Bulk button → every row of one or more sections marked paid in a single payload. */
export function markAllPaidPayload(targets: PaymentTarget[]): MatchMoneyUpdates {
  const players = new Map<string, PlayerMoneyUpdate>();
  const trainerPayments: TrainerPaymentUpdate[] = [];

  targets.forEach((target) => {
    if (target.kind === 'trainer') {
      trainerPayments.push({ id: target.paymentId, isPaid: true });
      return;
    }
    const existing = players.get(target.userId) ?? { userId: target.userId };
    players.set(target.userId, { ...existing, ...playerFlag(target, true) });
  });

  const updates: MatchMoneyUpdates = {};
  if (players.size > 0) updates.players = [...players.values()];
  if (trainerPayments.length > 0) updates.trainerPayments = trainerPayments;
  return updates;
}
