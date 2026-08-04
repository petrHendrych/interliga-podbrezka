import { desc, sql } from 'drizzle-orm';
import {
  Bot, CircleUserRound, Link2, Mail, UserRoundCheck,
} from 'lucide-react';
import { db } from '@/lib/db';
import { matchPlayerResults, users as usersTable } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { approveUser } from '@/lib/admin-actions';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Dictionary } from '@/lib/i18n/types';
import { DeleteUserButton } from './DeleteUserButton';
import { LinkPlayerDialog, type LinkCandidate } from './LinkPlayerDialog';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const SECTION_HINT = 'mt-1 text-sm text-muted-foreground';
const COUNT_PILL = 'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-bold tabular-nums';
const USER_CARD = 'flex h-full flex-col gap-3 rounded-xl bg-surface-2 p-4';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const BADGE = 'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold';
const META_ROW = 'flex items-center gap-1.5 text-muted-foreground min-w-0';
const AVATAR = 'flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-xs font-bold uppercase';

/** Diacritics and word order differ between the scraper and manual sign-ups. */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function roleLabel(role: string, dict: Dictionary): string {
  const { roles } = dict.admin.users;
  if (role === 'admin') return roles.admin;
  if (role === 'trainer') return roles.trainer;
  return roles.player;
}

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict.admin.users;

  const [userRows, resultCounts] = await db.batch([
    db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        isApproved: usersTable.isApproved,
        externalPlayerId: usersTable.externalPlayerId,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt)),
    db
      .select({
        userId: matchPlayerResults.userId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(matchPlayerResults)
      .groupBy(matchPlayerResults.userId),
  ]);

  const matchesByUserId = new Map(resultCounts.map((r) => [r.userId, r.count]));
  const matchesOf = (userId: string) => matchesByUserId.get(userId) ?? 0;

  const pendingUsers = userRows.filter((u) => !u.isApproved);
  const approvedUsers = userRows.filter((u) => u.isApproved);

  // Scraped placeholders never have an e-mail — they exist only so match results
  // have something to hang off. Everything else is a real, registered account.
  const registeredUsers = approvedUsers.filter((u) => u.email !== null);
  const scrapedUsers = approvedUsers
    .filter((u) => u.email === null)
    .sort((a, b) => matchesOf(b.id) - matchesOf(a.id) || a.name.localeCompare(b.name));

  const linkableScraped = scrapedUsers.filter((u) => u.externalPlayerId !== null);

  const candidatesFor = (accountName: string): LinkCandidate[] => {
    const normalized = normalizeName(accountName);
    return linkableScraped
      .map((u) => ({
        id: u.id,
        name: u.name,
        externalPlayerId: u.externalPlayerId,
        matchesCount: matchesOf(u.id),
        isSuggested: normalizeName(u.name) === normalized,
      }))
      .sort((a, b) => Number(b.isSuggested) - Number(a.isSuggested)
        || a.name.localeCompare(b.name));
  };

  const dateFormatter = new Intl.DateTimeFormat(lang, {
    timeZone: 'Europe/Bratislava',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const deleteTranslations = {
    cancel: dict.common.cancel,
    delete: dict.common.delete,
    errors: t.errors,
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-8xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>{t.pendingTitle}</h2>
            <p className={SECTION_HINT}>{t.pendingDescription}</p>
          </div>
          <span className={COUNT_PILL}>{pendingUsers.length}</span>
        </div>

        <div className="mt-4">
          {pendingUsers.length === 0 ? (
            <p className={EMPTY_STATE}>{t.noPending}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {pendingUsers.map((user) => (
                <div
                  key={user.id}
                  className={`${USER_CARD} ring-1 ring-inset ring-amber-500/30`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`${AVATAR} text-amber-600 dark:text-amber-400`}>
                      {initials(user.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold leading-tight truncate">{user.name}</p>
                      <p className={`${META_ROW} text-sm`}>
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </p>
                    </div>
                  </div>

                  {user.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      {interpolate(t.registeredAt, {
                        date: dateFormatter.format(user.createdAt),
                      })}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <form action={approveUser.bind(null, user.id)}>
                      <Button type="submit" size="sm">
                        <UserRoundCheck />
                        {t.approve}
                      </Button>
                    </form>
                    <DeleteUserButton
                      userId={user.id}
                      label={t.reject}
                      title={t.rejectTitle}
                      description={t.rejectDescription}
                      translations={deleteTranslations}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>{t.registeredTitle}</h2>
            <p className={SECTION_HINT}>{t.registeredDescription}</p>
          </div>
          <span className={COUNT_PILL}>{registeredUsers.length}</span>
        </div>

        <div className="mt-4">
          {registeredUsers.length === 0 ? (
            <p className={EMPTY_STATE}>{t.noRegistered}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {registeredUsers.map((user) => (
                <div key={user.id} className={USER_CARD}>
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={AVATAR}>{initials(user.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-bold leading-tight truncate">{user.name}</p>
                        <span className={`${BADGE} bg-surface text-muted-foreground`}>
                          {roleLabel(user.role, dict)}
                        </span>
                      </div>
                      <p className={`${META_ROW} text-sm`}>
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </p>
                    </div>
                  </div>

                  {user.externalPlayerId !== null ? (
                    <p className={`${META_ROW} text-xs`}>
                      <Link2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate">
                        {interpolate(t.linkedTo, { id: user.externalPlayerId })}
                        {' · '}
                        {interpolate(t.matchesCount, { count: matchesOf(user.id) })}
                      </span>
                    </p>
                  ) : (
                    <p className={`${META_ROW} text-xs`}>
                      <CircleUserRound className="size-3.5 shrink-0" />
                      <span className="truncate">{t.notLinked}</span>
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {user.externalPlayerId === null && (
                      <LinkPlayerDialog
                        accountId={user.id}
                        accountName={user.name}
                        candidates={candidatesFor(user.name)}
                        translations={{
                          trigger: t.link.trigger,
                          title: t.link.title,
                          description: t.link.description,
                          placeholder: t.link.placeholder,
                          suggested: t.link.suggested,
                          matches: t.matchesCount,
                          empty: t.link.empty,
                          confirm: t.link.confirm,
                          cancel: dict.common.cancel,
                          errors: t.errors,
                        }}
                      />
                    )}
                    <DeleteUserButton
                      userId={user.id}
                      label={t.remove}
                      title={t.removeTitle}
                      description={t.removeDescription}
                      translations={deleteTranslations}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>{t.scrapedTitle}</h2>
            <p className={SECTION_HINT}>{t.scrapedDescription}</p>
          </div>
          <span className={COUNT_PILL}>{scrapedUsers.length}</span>
        </div>

        <div className="mt-4">
          {scrapedUsers.length === 0 ? (
            <p className={EMPTY_STATE}>{t.noScraped}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {scrapedUsers.map((user) => (
                <div
                  key={user.id}
                  className={`${USER_CARD} border border-dashed border-foreground/20`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <p className="font-bold leading-tight truncate">{user.name}</p>
                    <span className={`${BADGE} bg-surface text-muted-foreground`}>
                      <Bot className="size-3" />
                      {t.autoBadge}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-surface p-2 text-center">
                      <dt className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                        {t.playerIdLabel}
                      </dt>
                      <dd className="text-sm font-bold tabular-nums">
                        {user.externalPlayerId ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-surface p-2 text-center">
                      <dt className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                        {t.matchesLabel}
                      </dt>
                      <dd className="text-sm font-bold tabular-nums">{matchesOf(user.id)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {t.autoHint}
                    </span>
                    <DeleteUserButton
                      userId={user.id}
                      label={t.remove}
                      title={t.removeTitle}
                      description={t.removeScrapedDescription}
                      showLabel={false}
                      translations={deleteTranslations}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
