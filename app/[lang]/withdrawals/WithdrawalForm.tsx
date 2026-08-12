'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createWithdrawal, type WithdrawalError } from '@/lib/bank-withdrawal-actions';
import { WITHDRAWAL_CATEGORIES, type WithdrawalCategory } from '@/lib/withdrawal-categories';

export interface WithdrawalFormTranslations {
  formTitle: string;
  amount: string;
  amountPlaceholder: string;
  date: string;
  datePlaceholder: string;
  category: string;
  categoryPlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  save: string;
  saving: string;
  categories: Record<WithdrawalCategory, string>;
  errors: Record<WithdrawalError, string>;
}

interface WithdrawalFormProps {
  lang: string;
  /** `YYYY-MM-DD` in Bratislava time, so the default day matches the team's clock. */
  today: string;
  translations: WithdrawalFormTranslations;
}

const LABEL = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-4';
const FIELD = 'flex flex-col gap-1.5';
const CARD = 'rounded-2xl bg-surface p-4 sm:p-6 shadow-lift-lg';
const MAX_DESCRIPTION_LENGTH = 300;

export function WithdrawalForm({ lang, today, translations }: WithdrawalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<WithdrawalError | null>(null);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<WithdrawalCategory>('food');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createWithdrawal({
        amount, description, category, date,
      });

      if (result.success) {
        setAmount('');
        setDescription('');
        setDate(today);
        setCategory('food');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <section className={CARD}>
      <h2 className="font-bold text-lg sm:text-xl leading-tight">{translations.formTitle}</h2>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <label htmlFor="withdrawal-amount" className={FIELD}>
          <span className={LABEL}>{translations.amount}</span>
          <Input
            id="withdrawal-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={amount}
            placeholder={translations.amountPlaceholder}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isPending}
            className="tabular-nums"
          />
        </label>

        <div className={FIELD}>
          <span className={LABEL}>{translations.date}</span>
          <DatePicker
            value={date}
            onValueChange={setDate}
            placeholder={translations.datePlaceholder}
            lang={lang}
            disabled={isPending}
          />
        </div>

        <div className={`${FIELD} sm:col-span-2`}>
          <span className={LABEL}>{translations.category}</span>
          <Select
            value={category}
            onValueChange={(value: string | null) => (
              value && setCategory(value as WithdrawalCategory)
            )}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder={translations.categoryPlaceholder}>
                {translations.categories[category]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[var(--anchor-width)]">
              {WITHDRAWAL_CATEGORIES.map((key) => (
                <SelectItem key={key} value={key}>{translations.categories[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label htmlFor="withdrawal-description" className={`${FIELD} sm:col-span-2`}>
          <span className={LABEL}>{translations.descriptionLabel}</span>
          <Textarea
            id="withdrawal-description"
            value={description}
            placeholder={translations.descriptionPlaceholder}
            maxLength={MAX_DESCRIPTION_LENGTH}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isPending}
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {translations.errors[error]}
        </p>
      )}

      <div className="mt-4">
        <Button onClick={handleSubmit} disabled={isPending} size="lg" className="w-full sm:w-auto">
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {isPending ? translations.saving : translations.save}
        </Button>
      </div>
    </section>
  );
}
