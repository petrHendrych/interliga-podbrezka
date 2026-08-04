'use client';

import { Loader2, RefreshCw } from 'lucide-react';
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

export interface SyncDataDialogTranslations {
  syncData: string;
  syncing: string;
  syncConfirmTitle: string;
  syncConfirmDescription: string;
  cancel: string;
}

interface SyncDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSyncing: boolean;
  onConfirm: () => void;
  translations: SyncDataDialogTranslations;
}

/**
 * Controlled on purpose: the trigger lives inside a menu that closes on click,
 * so the dialog is rendered outside of it and driven by `useSyncData`.
 */
export function SyncDataDialog({
  open,
  onOpenChange,
  isSyncing,
  onConfirm,
  translations,
}: SyncDataDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{translations.syncConfirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{translations.syncConfirmDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSyncing}>{translations.cancel}</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {isSyncing ? translations.syncing : translations.syncData}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
