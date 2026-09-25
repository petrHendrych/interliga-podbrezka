import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import type { ReactNode } from 'react';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { MatchMoneyError, getMatchSheet, type MatchSheet } from '@/lib/match-money';
import type { PaymentTarget } from '@/lib/match-money-payload';
import { formatDateOnly } from '@/lib/home-helpers';
import { leagueLabelForId } from '@/lib/i18n/league-labels';
import { MarkAllPaidButton } from '@/components/money/MarkAllPaidButton';
import { PlayerMoneyCard } from '@/components/money/PlayerMoneyCard';
import { TrainerPaymentCard } from '@/components/money/TrainerPaymentCard';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const META_ROW = 'flex items-center gap-1.5 text-muted-foreground min-w-0 text-sm';

interface PageProps {
  params: Promise<{ lang: string; matchId: string }>;
}

async function loadSheet(matchId: number): Promise<MatchSheet | null> {
  try {
    return await getMatchSheet(matchId);
  } catch (error) {
    if (error instanceof MatchMoneyError && error.code === 'notFound') return null;
    throw error;
  }
}

async function externalIdsFor(userIds: string[]): Promise<Map<string, number | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, externalPlayerId: users.externalPlayerId })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.externalPlayerId ?? null]));
}

function openFirst<T>(
  isOpen: (row: T) => boolean,
  name: (row: T) => string,
  lang: Locale,
): (a: T, b: T) => number {
  return (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || name(a).localeCompare(name(b), lang);
}

interface TotalChipProps {
  label: string;
  unpaid: number;
  total: number;
  format: string;
}

function TotalChip({
  label, unpaid, total, format,
}: TotalChipProps) {
  const tone = unpaid > 0
    ? 'text-red-600 dark:text-red-400'
    : 'text-emerald-600 dark:text-emerald-400';
  return (
    <div className="rounded-lg bg-surface-2 p-2 text-center">
      <span className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${tone}`}>
        {interpolate(format, { unpaid, total })}
      </span>
    </div>
  );
}

interface SectionProps {
  title: string;
  action: ReactNode;
  children: ReactNode;
}

function Section({ title, action, children }: SectionProps) {
  return (
    <section className={SECTION}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={SECTION_TITLE}>{title}</h2>
        {action}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function AdminMoneySheetPage({ params }: PageProps) {
  const { lang: langParam, matchId: matchIdParam } = await params;
  const lang = langParam as Locale;
  const matchId = Number.parseInt(matchIdParam, 10);
  if (Number.isNaN(matchId)) notFound();

  const [dict, sheet] = await Promise.all([getDictionary(lang), loadSheet(matchId)]);
  if (!sheet) notFound();

  const t = dict.admin.money;
  const { match, totals } = sheet;
  const owed = (player: MatchSheet['players'][number]) => player.calculated_fine + player.streak_fine;

  const externalIds = await externalIdsFor(sheet.players.map((p) => p.user_id));
  const cardPlayers = sheet.players.map((p) => ({
    ...p,
    external_player_id: externalIds.get(p.user_id) ?? null,
  }));

  const players = [...cardPlayers]
    .sort(openFirst((p) => !p.is_paid && owed(p) > 0, (p) => p.user_name, lang));
  const bonusPlayers = cardPlayers
    .filter((p) => p.bonus_received > 0)
    .sort(openFirst((p) => !p.is_bonus_paid, (p) => p.user_name, lang));
  const trainerPayments = [...sheet.trainer_payments]
    .sort(openFirst((p) => !p.isPaid, (p) => p.userName, lang));

  const fineTargets: PaymentTarget[] = players
    .filter((p) => !p.is_paid && owed(p) > 0)
    .map((p) => ({ kind: 'fine', userId: p.user_id }));
  const bonusTargets: PaymentTarget[] = bonusPlayers
    .filter((p) => !p.is_bonus_paid)
    .map((p) => ({ kind: 'bonus', userId: p.user_id }));
  const trainerTargets: PaymentTarget[] = trainerPayments
    .filter((p) => !p.isPaid)
    .map((p) => ({ kind: 'trainer', paymentId: p.id }));

  const matchLabel = match.is_home
    ? interpolate(dict.playerDetail.matchHome, { opponent: match.opponent ?? '—' })
    : interpolate(dict.playerDetail.matchAway, { opponent: match.opponent ?? '—' });

  const cardLabels = {
    paid: t.paid,
    unpaid: t.unpaid,
    markPaid: t.markPaid,
    markUnpaid: t.markUnpaid,
    total: t.total,
    faults: t.faults,
    fine: t.fine,
    bonus: t.bonus,
  };
  const bulkTranslations = { cancel: dict.common.cancel, confirm: t.confirm, errors: t.errors };

  const bulkButton = (targets: PaymentTarget[]) => (
    <MarkAllPaidButton
      matchId={matchId}
      targets={targets}
      label={t.markAllPaid}
      title={t.markAllPaidTitle}
      description={t.markAllPaidDescription}
      translations={bulkTranslations}
    />
  );

  const allTargets: PaymentTarget[] = [...fineTargets, ...bonusTargets, ...trainerTargets];

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <Link
        href={`/${lang}/admin/money`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.backToList}
      </Link>

      <div className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{matchLabel}</h1>
            <p className={META_ROW}>
              <CalendarDays className="size-3.5 shrink-0" />
              <span className="truncate">
                {match.date ? formatDateOnly(match.date, lang) : '—'}
                {' · '}
                {leagueLabelForId(match.league_id, match.league_name, dict)}
              </span>
            </p>
          </div>
          <span className="shrink-0 text-xl font-bold tabular-nums">
            {`${match.team_total_score ?? '—'} : ${match.opponent_total_score ?? '—'}`}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <TotalChip
            label={t.finesUnpaid}
            unpaid={totals.fines_unpaid}
            total={totals.fines}
            format={t.unpaidOf}
          />
          <TotalChip
            label={t.bonusesUnpaid}
            unpaid={totals.bonuses_unpaid}
            total={totals.bonuses}
            format={t.unpaidOf}
          />
          <TotalChip
            label={t.trainerUnpaid}
            unpaid={totals.trainer_unpaid}
            total={totals.trainer}
            format={t.unpaidOf}
          />
        </div>

        <div className="mt-4">
          <MarkAllPaidButton
            matchId={matchId}
            targets={allTargets}
            variant="default"
            className="w-full sm:w-auto"
            label={t.markMatchPaid}
            title={t.markMatchPaidTitle}
            description={interpolate(t.markMatchPaidDescription, {
              fines: totals.fines_unpaid,
              bonuses: totals.bonuses_unpaid,
              trainer: totals.trainer_unpaid,
            })}
            translations={bulkTranslations}
          />
        </div>
      </div>

      <Section title={t.playersTitle} action={bulkButton(fineTargets)}>
        {players.map((player) => (
          <PlayerMoneyCard
            key={player.user_id}
            matchId={matchId}
            player={player}
            labels={cardLabels}
            errors={t.errors}
            rows={['fine', 'bonus']}
          />
        ))}
      </Section>

      <Section title={t.bonusesTitle} action={bulkButton(bonusTargets)}>
        {bonusPlayers.length === 0 ? (
          <p className={`${EMPTY_STATE} lg:col-span-2`}>{t.noBonuses}</p>
        ) : (
          bonusPlayers.map((player) => (
            <PlayerMoneyCard
              key={player.user_id}
              matchId={matchId}
              player={player}
              labels={cardLabels}
              errors={t.errors}
              rows={['bonus']}
            />
          ))
        )}
      </Section>

      <Section title={t.trainerTitle} action={bulkButton(trainerTargets)}>
        {trainerPayments.length === 0 ? (
          <p className={`${EMPTY_STATE} lg:col-span-2`}>{t.noTrainerPayments}</p>
        ) : (
          trainerPayments.map((payment) => (
            <TrainerPaymentCard
              key={payment.id}
              matchId={matchId}
              payment={payment}
              labels={cardLabels}
              conditions={t.conditions}
              errors={t.errors}
            />
          ))
        )}
      </Section>
    </div>
  );
}
