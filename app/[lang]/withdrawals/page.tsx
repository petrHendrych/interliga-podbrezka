import { CalendarDays, Tag, UserRound } from 'lucide-react';
import { Locale, interpolate } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getSession } from '@/lib/session';
import { listWithdrawals } from '@/lib/bank-withdrawals';
import { formatDateOnly, getStartOfBratislavaToday } from '@/lib/home-helpers';
import { getSeasonConfig } from '@/lib/season-config';
import { WithdrawalForm } from './WithdrawalForm';
import { DeleteWithdrawalButton } from './DeleteWithdrawalButton';

const SECTION = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const SECTION_TITLE = 'font-bold text-lg sm:text-xl leading-tight';
const COUNT_PILL = 'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 px-2 text-xs font-bold tabular-nums';
const WITHDRAWAL_CARD = 'flex h-full flex-col gap-3 rounded-xl bg-surface-2 p-4';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const META_ROW = 'flex items-center gap-1.5 text-muted-foreground min-w-0 text-sm';

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function WithdrawalsPage({ params }: PageProps) {
  const { lang: langParam } = await params;
  const lang = langParam as Locale;
  const dict = await getDictionary(lang);
  const t = dict.withdrawals;

  const [session, withdrawals] = await Promise.all([getSession(), listWithdrawals()]);
  const isAdmin = session?.user.role === 'admin';
  const total = withdrawals.reduce((sum, w) => sum + w.amount, 0);

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.description}</p>
      </div>

      {isAdmin && (
        <WithdrawalForm
          lang={lang}
          today={getStartOfBratislavaToday().toISOString().slice(0, 10)}
          translations={{
            formTitle: t.formTitle,
            amount: t.amount,
            amountPlaceholder: t.amountPlaceholder,
            date: t.date,
            datePlaceholder: t.datePlaceholder,
            category: t.category,
            categoryPlaceholder: t.categoryPlaceholder,
            descriptionLabel: t.descriptionLabel,
            descriptionPlaceholder: t.descriptionPlaceholder,
            save: t.save,
            saving: t.saving,
            categories: t.categories,
            errors: t.errors,
          }}
        />
      )}

      <section className={SECTION}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={SECTION_TITLE}>{t.listTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span>{`${t.totalLabel}: `}</span>
              <span className="font-bold tabular-nums">{`${total.toFixed(2)} €`}</span>
            </p>
          </div>
          <span className={COUNT_PILL}>{withdrawals.length}</span>
        </div>

        <div className="mt-4">
          {withdrawals.length === 0 ? (
            <p className={EMPTY_STATE}>{t.empty}</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className={WITHDRAWAL_CARD}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={META_ROW}>
                        <CalendarDays className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {formatDateOnly(withdrawal.withdrawnAt, lang)}
                          {' · '}
                          {getSeasonConfig(withdrawal.seasonId)?.name ?? withdrawal.seasonId}
                        </span>
                      </p>
                      <p className={META_ROW}>
                        <Tag className="size-3.5 shrink-0" />
                        <span className="truncate">{t.categories[withdrawal.category]}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                      {`-${withdrawal.amount.toFixed(2)} €`}
                    </span>
                  </div>

                  <p className="text-sm leading-snug break-words">{withdrawal.description}</p>

                  {withdrawal.authorName && (
                    <p className={META_ROW}>
                      <UserRound className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {interpolate(t.addedBy, { name: withdrawal.authorName })}
                      </span>
                    </p>
                  )}

                  {isAdmin && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <DeleteWithdrawalButton
                        withdrawalId={withdrawal.id}
                        label={t.delete}
                        title={t.deleteTitle}
                        description={t.deleteDescription}
                        translations={{
                          cancel: dict.common.cancel,
                          delete: t.delete,
                          errors: t.errors,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
