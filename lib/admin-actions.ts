'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { getSession } from './session';

export async function approveUser(userId: string) {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  try {
    await db
      .update(users)
      .set({ isApproved: true })
      .where(eq(users.id, userId));
    revalidatePath('/[lang]/admin/users', 'page');
  } catch (error) {
    console.error('Failed to approve user:', error);
    throw new Error('Failed to approve user');
  }
}

export async function deleteUser(userId: string) {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  if (session.user.id === userId) {
    throw new Error('Nemôžete vymazať sami seba');
  }

  try {
    await db
      .delete(users)
      .where(eq(users.id, userId));
    revalidatePath('/[lang]/admin/users', 'page');
  } catch (error) {
    console.error('Failed to delete user:', error);
    throw new Error('Failed to delete user');
  }
}
