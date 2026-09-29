import 'server-only';
import { headers } from 'next/headers';
import type { UserPayload } from './auth';
import { ACTIVITY_PATH_HEADER } from './activity-header';
import { getSession } from './session';

type ActivityFields = Record<string, string | number | null | undefined>;
type ActivityUser = Pick<UserPayload, 'id' | 'name' | 'role'>;

const REPEAT_VIEW_WINDOW_MS = 10 * 60 * 1000;

// Per server instance only, so two Vercel instances may each log the same visit once.
const lastViewByUser = new Map<string, { path: string; seenAt: number }>();

export function formatActivity(
  event: string,
  detail: string | null,
  fields: ActivityFields = {},
  user?: ActivityUser | null,
): string {
  const parts = ['[activity]', event];
  if (detail) parts.push(detail);
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') parts.push(`${key}=${value}`);
  });
  // Last, because a name may contain spaces and would blur the key=value pairs after it.
  if (user) parts.push(`user=${user.name} id=${user.id} role=${user.role}`);
  return parts.join(' ');
}

export function logActivity(...args: Parameters<typeof formatActivity>): void {
  // eslint-disable-next-line no-console
  console.log(formatActivity(...args));
}

export async function logPageView(): Promise<void> {
  const requestHeaders = await headers();
  // A server action that revalidates re-renders the page inside its POST; that is not a visit.
  if (requestHeaders.has('next-action')) return;

  const path = requestHeaders.get(ACTIVITY_PATH_HEADER);
  if (!path) return;

  const session = await getSession();
  if (!session) return;

  // useLiveDataRefresh re-renders the page on every focus of the app, and a refresh is
  // indistinguishable from a visit here, so the same page within the window is one visit.
  const now = Date.now();
  const last = lastViewByUser.get(session.user.id);
  lastViewByUser.set(session.user.id, { path, seenAt: now });
  if (last?.path === path && now - last.seenAt < REPEAT_VIEW_WINDOW_MS) return;

  logActivity('view', path, {}, session.user);
}
