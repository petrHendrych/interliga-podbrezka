'use client';

import { Bell, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { PushActionError } from '@/lib/push-actions';

export interface NotifyUsersDialogTranslations {
  notifyUsers: string;
  notifySending: string;
  notifyConfirmTitle: string;
  notifyConfirmDescription: string;
  notifyErrors: Record<string, string>;
  cancel: string;
}

interface NotifyUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isNotifying: boolean;
  error: PushActionError | null;
  onConfirm: () => void;
  translations: NotifyUsersDialogTranslations;
}

/** Controlled like `SyncDataDialog`: its trigger sits in a menu that closes on click. */
export function NotifyUsersDialog({
  open,
  onOpenChange,
  isNotifying,
  error,
  onConfirm,
  translations,
}: NotifyUsersDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{translations.notifyConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{translations.notifyConfirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive">{translations.notifyErrors[error]}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isNotifying}>{translations.cancel}</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={isNotifying}>
            {isNotifying ? <Loader2 className="animate-spin" /> : <Bell />}
            {isNotifying ? translations.notifySending : translations.notifyUsers}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
