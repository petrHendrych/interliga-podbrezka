import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { trainerPayments, users } from './db/schema';

export interface TrainerPayment {
  id: number;
  matchId: number;
  userId: string;
  userName: string;
  conditionType: string;
  amount: number;
  isPaid: boolean;
}

export async function getMatchTrainerPayments(matchId: number): Promise<TrainerPayment[]> {
  const rows = await db
    .select({
      id: trainerPayments.id,
      matchId: trainerPayments.matchId,
      userId: trainerPayments.userId,
      userName: users.name,
      conditionType: trainerPayments.conditionType,
      amount: trainerPayments.amount,
      isPaid: trainerPayments.isPaid,
    })
    .from(trainerPayments)
    .innerJoin(users, eq(trainerPayments.userId, users.id))
    .where(eq(trainerPayments.matchId, matchId));

  return rows.map((r) => ({
    id: Number(r.id),
    matchId: Number(r.matchId),
    userId: String(r.userId),
    userName: String(r.userName),
    conditionType: String(r.conditionType),
    amount: Number(r.amount),
    isPaid: Boolean(r.isPaid),
  }));
}

export async function updateTrainerPaymentStatus(
  paymentId: number,
  isPaid: boolean,
): Promise<void> {
  await db
    .update(trainerPayments)
    .set({ isPaid })
    .where(eq(trainerPayments.id, paymentId));
}

export async function updateTrainerPaymentStatusByKeys(
  matchId: number,
  userId: string,
  conditionType: string,
  isPaid: boolean,
): Promise<void> {
  await db
    .update(trainerPayments)
    .set({ isPaid })
    .where(
      and(
        eq(trainerPayments.matchId, matchId),
        eq(trainerPayments.userId, userId),
        eq(trainerPayments.conditionType, conditionType),
      ),
    );
}
