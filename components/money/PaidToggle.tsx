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

  const actionLabel = isPaid ? labels.markUnpaid : labels.markPaid;

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyMatchMoney(matchId, paymentPayload(target, !isPaid));
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={isPaid ? 'outline' : 'default'}
        onClick={handleToggle}
        disabled={isPending}
        aria-label={actionLabel}
        title={actionLabel}
      >
        {isPending && <Loader2 className="animate-spin" />}
        {!isPending && (isPaid ? <Undo2 /> : <Check />)}
        {isPaid ? labels.paid : labels.unpaid}
      </Button>
      {error && (
        <p className="rounded-lg bg-destructive/15 px-2 py-1 text-xs text-destructive">
          {errors[error]}
        </p>
      )}
    </div>
  );
}
