'use server';

/* eslint-disable no-console */
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { hashPassword, verifyPassword } from './auth';
import { setSession, clearSession } from './session';

type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export async function signUp(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!name || !email || !password) {
    return { error: 'missingFields' };
  }

  const hashedPassword = await hashPassword(password);

  try {
    await db.insert(users).values({
      name,
      email,
      passwordHash: hashedPassword,
      role: 'player',
      isApproved: false,
    });
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError.code === '23505') {
      return { error: 'emailExists' };
    }
    console.error('Sign up error:', error);
    return { error: 'genericError' };
  }

  return { success: true };
}

export async function signIn(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'missingFields' };
  }

  let user;
  try {
    const results = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
        isApproved: users.isApproved,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    [user] = results;
  } catch (error) {
    console.error('Sign in DB error:', error);
    return { error: 'dbError' };
  }

  if (!user || !user.passwordHash) {
    return { error: 'invalidCredentials' };
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return { error: 'invalidCredentials' };
  }

  if (!user.isApproved) {
    return { error: 'notApproved' };
  }

  await setSession({
    id: user.id,
    role: user.role,
    name: user.name,
  });

  redirect('/');
  return null; // Should not reach here due to redirect
}

export async function signOut() {
  await clearSession();
  redirect('/sign-in');
}

/*
export async function requestPasswordReset(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email je povinný' };

  try {
    const results = await sql`SELECT id FROM users WHERE email = ${email}`;
    const user = results[0];

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await sql`
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES (${user.id as string}, ${token}, ${expiresAt})
      `;

      await sendPasswordResetEmail(email, token);
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    // Continue anyway to prevent enumeration
  }

  // Vždy vrátime úspech, aby sme zabránili odhaľovaniu existujúcich emailov
  return { success: true };
}

export async function resetPassword(
  prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get('token') as string;
  const password = formData.get('password') as string;

  if (!token || !password) return { error: 'Chýba token alebo heslo' };

  try {
    const results = await sql`
      SELECT user_id, expires_at
      FROM password_reset_tokens
      WHERE token = ${token}
    `;
    const resetToken = results[0];

    if (!resetToken || new Date() > new Date(resetToken.expires_at as string)) {
      return { error: 'Neplatný alebo expirovaný token' };
    }

    const hashedPassword = await hashPassword(password);

    await sql`
      UPDATE users SET password_hash = ${hashedPassword} WHERE id = ${resetToken.user_id as string}
    `;
    await sql`
      DELETE FROM password_reset_tokens WHERE token = ${token}
    `;
  } catch (error) {
    console.error('Password reset error:', error);
    return { error: 'Nepodarilo sa resetovať heslo' };
  }

  return { success: true };
}
*/
