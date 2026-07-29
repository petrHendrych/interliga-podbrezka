import sql from './db';
import { ensureSchema } from './db-utils';

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
  await ensureSchema();
  const rows = await sql`
    SELECT 
      tp.id,
      tp.match_id,
      tp.user_id,
      u.name as user_name,
      tp.condition_type,
      tp.amount,
      tp.is_paid
    FROM trainer_payments tp
    JOIN users u ON tp.user_id = u.id
    WHERE tp.match_id = ${matchId}
    ORDER BY u.name ASC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    matchId: Number(r.match_id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    conditionType: String(r.condition_type),
    amount: Number(r.amount),
    isPaid: Boolean(r.is_paid),
  }));
}

export async function updateTrainerPaymentStatus(
  paymentId: number,
  isPaid: boolean,
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE trainer_payments
    SET is_paid = ${isPaid}
    WHERE id = ${paymentId}
  `;
}

export async function updateTrainerPaymentStatusByKeys(
  matchId: number,
  userId: string,
  conditionType: string,
  isPaid: boolean,
): Promise<void> {
  await ensureSchema();
  await sql`
    UPDATE trainer_payments
    SET is_paid = ${isPaid}
    WHERE match_id = ${matchId} AND user_id = ${userId} AND condition_type = ${conditionType}
  `;
}
