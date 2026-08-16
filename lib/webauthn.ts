import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { users, webauthnCredentials } from './db/schema';

export interface StoredCredential {
  id: number;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  label: string;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export interface CredentialOwner extends StoredCredential {
  userId: string;
  userName: string;
  userRole: string;
  isApproved: boolean;
}

export async function listCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  return db
    .select({
      id: webauthnCredentials.id,
      credentialId: webauthnCredentials.credentialId,
      publicKey: webauthnCredentials.publicKey,
      counter: webauthnCredentials.counter,
      transports: webauthnCredentials.transports,
      label: webauthnCredentials.label,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId))
    .orderBy(desc(webauthnCredentials.createdAt));
}

/** Joins the owner in, because a discoverable sign-in knows the credential before the user. */
export async function findCredentialWithOwner(
  credentialId: string,
): Promise<CredentialOwner | undefined> {
  const [row] = await db
    .select({
      id: webauthnCredentials.id,
      credentialId: webauthnCredentials.credentialId,
      publicKey: webauthnCredentials.publicKey,
      counter: webauthnCredentials.counter,
      transports: webauthnCredentials.transports,
      label: webauthnCredentials.label,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
      userId: users.id,
      userName: users.name,
      userRole: users.role,
      isApproved: users.isApproved,
    })
    .from(webauthnCredentials)
    .innerJoin(users, eq(users.id, webauthnCredentials.userId))
    .where(eq(webauthnCredentials.credentialId, credentialId))
    .limit(1);

  if (!row) return undefined;
  return { ...row, isApproved: row.isApproved ?? false };
}

export interface NewCredentialInput {
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  deviceType: string | null;
  backedUp: boolean;
  label: string;
}

export async function insertCredential(input: NewCredentialInput): Promise<void> {
  await db.insert(webauthnCredentials).values(input);
}

export async function touchCredential(credentialId: string, counter: number): Promise<void> {
  await db
    .update(webauthnCredentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.credentialId, credentialId));
}

/** Scoped by userId, so one user can never delete another's credential. */
export async function deleteCredential(id: number, userId: string): Promise<number> {
  const deleted = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
    .returning({ id: webauthnCredentials.id });
  return deleted.length;
}

export async function renameCredential(
  id: number,
  userId: string,
  label: string,
): Promise<number> {
  const updated = await db
    .update(webauthnCredentials)
    .set({ label })
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
    .returning({ id: webauthnCredentials.id });
  return updated.length;
}
