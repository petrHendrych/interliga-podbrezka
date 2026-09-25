'use client';

import { useState, useTransition } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { applyMatchMoney, type MatchMoneyActionError } from '@/lib/match-money-actions';
import { markAllPaidPayload, type PaymentTarget } from '@/lib/match-money-payload';

export interface MarkAllPaidButtonProps {
  matchId: number;
  targets: PaymentTarget[];
  label: string;
  title: string;
  description: string;
  variant?: 'default' | 'outline';
  className?: string;
  translations: {
    cancel: string;
    confirm: string;
    errors: Record<MatchMoneyActionError, string>;
  };
}

export function MarkAllPaidButton({
  matchId,
  targets,
  label,
  title,
  description,
  variant = 'outline',
  className,
  translations,
}: MarkAllPaidButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<MatchMoneyActionError | null>(null);

  // Stays open on failure so the reason is visible instead of silently swallowed.
  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyMatchMoney(matchId, markAllPaidPayload(targets));
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setError(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={(
          <Button variant={variant} size="sm" className={className} disabled={targets.length === 0}>
            <CheckCheck />
            {label}
          </Button>
        )}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {translations.errors[error]}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{translations.cancel}</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            {translations.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
