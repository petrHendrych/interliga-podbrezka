'use client';

import { useState, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
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
import { deleteWithdrawal, type WithdrawalError } from '@/lib/bank-withdrawal-actions';

interface DeleteWithdrawalButtonProps {
  withdrawalId: number;
  label: string;
  title: string;
  description: string;
  translations: {
    cancel: string;
    delete: string;
    errors: Record<WithdrawalError, string>;
  };
}

export function DeleteWithdrawalButton({
  withdrawalId,
  label,
  title,
  description,
  translations,
}: DeleteWithdrawalButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<WithdrawalError | null>(null);

  // Stays open on failure so the reason is visible instead of silently swallowed.
  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteWithdrawal(withdrawalId);
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
          <Button variant="destructive" size="sm">
            <Trash2 />
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
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {translations.delete}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
