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
import { deleteUser, type AdminActionError } from '@/lib/admin-actions';

interface DeleteUserButtonProps {
  userId: string;
  label: string;
  title: string;
  description: string;
  /** `false` keeps the trigger icon-only, for the denser scraped-player cards. */
  showLabel?: boolean;
  translations: {
    cancel: string;
    delete: string;
    errors: Record<AdminActionError, string>;
  };
}

export function DeleteUserButton({
  userId,
  label,
  title,
  description,
  showLabel = true,
  translations,
}: DeleteUserButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<AdminActionError | null>(null);

  // Stays open on failure so the reason is visible instead of silently swallowed.
  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
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
          <Button
            variant="destructive"
            size={showLabel ? 'sm' : 'icon-sm'}
            aria-label={showLabel ? undefined : label}
          >
            <Trash2 />
            {showLabel ? label : null}
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
