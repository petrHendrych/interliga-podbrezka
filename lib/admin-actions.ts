'use server';

/* eslint-disable no-console */

import { revalidatePath } from 'next/cache';
import sql from './db';
import { getSession } from './session';

export async function approveUser(userId: string) {
  const session = await getSession();
  if (session?.user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  try {
    await sql`
      UPDATE users SET is_approved = TRUE WHERE id = ${userId}
    `;
    revalidatePath('/admin/users');
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
    await sql`
      DELETE FROM users WHERE id = ${userId}
    `;
    revalidatePath('/admin/users');
  } catch (error) {
    console.error('Failed to delete user:', error);
    throw new Error('Failed to delete user');
  }
}
