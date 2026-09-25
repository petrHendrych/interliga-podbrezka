'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyMatchMoney, type MatchMoneyActionError } from '@/lib/match-money-actions';
import { paymentPayload, type PaymentTarget } from '@/lib/match-money-payload';

export interface PaidToggleLabels {
  paid: string;
  unpaid: string;
  markPaid: string;
  markUnpaid: string;
}

export interface PaidToggleProps {
  matchId: number;
  target: PaymentTarget;
  isPaid: boolean;
  labels: PaidToggleLabels;
  errors: Record<MatchMoneyActionError, string>;
  size?: 'sm' | 'xs';
}

const PILL = 'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold';
const PILL_TONE = {
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  unpaid: 'bg-red-500/15 text-red-700 dark:text-red-400',
} as const;

export function PaidToggle({
  matchId,
  target,
  isPaid,
  labels,
  errors,
  size = 'sm',
}: PaidToggleProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<MatchMoneyActionError | null>(null);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyMatchMoney(matchId, paymentPayload(target, !isPaid));
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className={`${PILL} ${isPaid ? PILL_TONE.paid : PILL_TONE.unpaid}`}>
          {isPaid ? labels.paid : labels.unpaid}
        </span>
        <Button
          type="button"
          size={size}
          variant={isPaid ? 'ghost' : 'default'}
          onClick={handleToggle}
          disabled={isPending}
        >
          {isPending && <Loader2 className="animate-spin" />}
          {!isPending && (isPaid ? <Undo2 /> : <Check />)}
          {isPaid ? labels.markUnpaid : labels.markPaid}
        </Button>
      </div>
      {error && (
        <p className="rounded-lg bg-destructive/15 px-2 py-1 text-xs text-destructive">
          {errors[error]}
        </p>
      )}
    </div>
  );
}
