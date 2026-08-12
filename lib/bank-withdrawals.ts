import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { bankWithdrawals, users } from './db/schema';
import { isWithdrawalCategory, type WithdrawalCategory } from './withdrawal-categories';

export interface WithdrawalListItem {
  id: number;
  amount: number;
  description: string;
  category: WithdrawalCategory;
  /** ISO string; formatted for display with `formatDateOnly()`. */
  withdrawnAt: string;
  seasonId: number;
  authorName: string | null;
}

export async function listWithdrawals(): Promise<WithdrawalListItem[]> {
  const rows = await db
    .select({
      id: bankWithdrawals.id,
      amount: bankWithdrawals.amount,
      description: bankWithdrawals.description,
      category: bankWithdrawals.category,
      withdrawnAt: bankWithdrawals.withdrawnAt,
      seasonId: bankWithdrawals.seasonId,
      authorName: users.name,
    })
    .from(bankWithdrawals)
    .leftJoin(users, eq(bankWithdrawals.createdBy, users.id))
    .orderBy(desc(bankWithdrawals.withdrawnAt), desc(bankWithdrawals.id));

  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    description: row.description,
    category: isWithdrawalCategory(row.category) ? row.category : 'other',
    withdrawnAt: row.withdrawnAt.toISOString(),
    seasonId: row.seasonId,
    authorName: row.authorName,
  }));
}
